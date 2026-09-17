import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "./worker";
import { recordId } from "./collection";
import { collectionRecord, readCollectionRecord, COLLECTION_BYTES } from "../web/src/collection-record";
import { beginEpisode, appendStep, finishEpisode } from "../web/src/episodes";
import { makeScenario } from "../web/src/scenario";
import { ParkingEngine, type StepResult } from "../engine/src/index";

export function sampleRecord(ticks = 3) {
  const s = makeScenario("open"), engine = new ParkingEngine();
  let before: StepResult = { observation: engine.reset(s), poseTruth: s.start, simTimeS: 0,
    appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 }, outcome: { terminated: false, reason: null } };
  const context = { viewMode: "follow", assistanceFlags: ["parking-status"] };
  const episode = beginEpisode(s, before, context);
  for (let i = 0; i < ticks; i++) {
    const after = engine.step(before.appliedCommand);
    appendStep(episode, before, before.appliedCommand, after, { ...context, gear: "P", inputs: [], analogSteer: null });
    before = after;
    if (after.outcome.terminated) break;
  }
  return collectionRecord(finishEpisode(episode, before.outcome.reason ?? "user_abort"));
}
function setup() {
  const data = new Map<string, string>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response("static") },
    RECORDS: {
      get: async k => data.has(k) ? { text: async () => data.get(k)! } : null,
      put: async (k, v, o) => { if (o?.onlyIf && data.has(k)) return null; data.set(k, v); return {}; },
      delete: async k => { data.delete(k); },
      list: async o => ({ objects: [...data.keys()].filter(k => k.startsWith(o.prefix)).map(key => ({ key })), truncated: false }),
    },
    COLLECTION_ENABLED: "true", RETENTION_CONFIGURED: "true", CONTACT_EMAIL: "contact@example.com", COLLECTION_ADMIN_TOKEN: "test-admin",
    UPLOAD_LIMIT: { limit: async () => ({ success: true }) }, GLOBAL_LIMIT: { limit: async () => ({ success: true }) },
  };
  return { data, env };
}
const token = "a".repeat(64);
const req = (method = "POST", body = JSON.stringify(sampleRecord()), receipt = token, origin = "https://mrpark.example") =>
  new Request("https://mrpark.example/api/episodes", { method, headers: { Origin: origin, Authorization: `Bearer ${receipt}`, "Content-Type": "application/json" }, ...(method === "POST" ? { body } : {}) });

test("업로드 형식은 원본 ID·시각 없이 센서/조작을 복원하고 90초 상한에 맞음", () => {
  const r = sampleRecord(1801), text = JSON.stringify(r);
  assert.ok(Buffer.byteLength(text) < COLLECTION_BYTES);
  assert.ok(!text.includes("startedAt") && !text.includes("wallTimestamp") && !text.includes("episodeId"));
  assert.equal(readCollectionRecord(text).episode.footer.terminationReason, "timeout");
  assert.throws(() => readCollectionRecord(JSON.stringify({ ...r, noticeVersion: "old" })));
  assert.throws(() => readCollectionRecord(JSON.stringify({ ...r, steps: [] })));
});
test("허용된 기록만 비공개 저장, 중복 멱등, 타인 읽기 차단, 삭제 후 재업로드 차단", async () => {
  const { data, env } = setup();
  assert.equal((await worker.fetch(req(), env)).status, 201);
  const key = `episodes/${await recordId(token)}.json`;
  assert.ok(data.has(key));
  assert.equal((await worker.fetch(req(), env)).status, 200);
  assert.equal((await worker.fetch(new Request(`https://mrpark.example/api/episodes/${await recordId(token)}`), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://mrpark.example/api/admin/records"), env)).status, 401);
  await worker.fetch(req("DELETE", "", "b".repeat(64)), env);
  assert.ok(data.has(key));
  await worker.fetch(req("DELETE"), env);
  assert.ok(!data.has(key));
  assert.equal((await worker.fetch(req(), env)).status, 410);
});
test("꺼짐·보관 미설정·교차 출처·형식·크기·빈도 오류에 R2 기록 없음", async () => {
  const { data, env } = setup();
  assert.equal((await worker.fetch(req(), { ...env, COLLECTION_ENABLED: "false" })).status, 503);
  assert.equal((await worker.fetch(req(), { ...env, RETENTION_CONFIGURED: "false" })).status, 503);
  assert.equal((await worker.fetch(req("POST", "{}", token, "https://other.example"), env)).status, 403);
  assert.equal((await worker.fetch(req("POST", "{}"), env)).status, 400);
  const big = req(); big.headers.set("Content-Length", String(COLLECTION_BYTES + 1));
  assert.equal((await worker.fetch(big, env)).status, 400);
  assert.equal((await worker.fetch(req(), { ...env, UPLOAD_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal(data.size, 0);
});
test("추가 필드는 저장하지 않고 저장 실패를 성공으로 응답하지 않음", async () => {
  const { env, data } = setup();
  const r = { ...sampleRecord(), email: "private@example.com" };
  assert.equal((await worker.fetch(req("POST", JSON.stringify(r)), env)).status, 201);
  assert.ok(![...data.values()].join("").includes("private@example.com"));
  env.RECORDS.put = async () => { throw Error("private-storage-details"); };
  const response = await worker.fetch(req("POST", JSON.stringify(sampleRecord()), "c".repeat(64)), env);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private-storage-details"));
});
test("일일 200개 전역 접수 슬롯이 차면 추가 원본을 저장하지 않음", async () => {
  const { data, env } = setup();
  const day = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 200; i++) data.set(`daily-limit/${day}/${i}.json`, "{}");
  assert.equal((await worker.fetch(req(), env)).status, 429);
  assert.equal([...data.keys()].filter(k => k.startsWith("episodes/")).length, 0);
});
