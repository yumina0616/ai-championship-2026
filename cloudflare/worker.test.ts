import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { type Env } from "./worker";

const makeEnv = (): Env => ({
  ASSETS: { fetch: async () => new Response("static") },
  RECORDS: { put: async () => ({}), delete: async () => {}, list: async () => ({ objects: [], truncated: false }), get: async (key) => {
    assert.equal(key, "operations/storage-check.json");
    return { text: async () => '{"kind":"synthetic-storage-check","version":1}\n' };
  } },
});
const request = (path: string, method = "GET") => new Request(`https://parkside.example${path}`, { method });
test("정적 웹은 전달하고 고정 합성 파일로 R2 연결 확인", async () => {
  assert.equal(await (await worker.fetch(request("/"), makeEnv())).text(), "static");
  const r = await worker.fetch(request("/api/health"), makeEnv());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { service: "parkside", storage: "ready", collection: "disabled" });
});
test("R2 장애/누락 시 성공으로 표시하지 않고 내부 오류는 노출하지 않음", async () => {
  for (const get of [async () => null, async () => { throw Error("private-details"); }]) {
    const r = await worker.fetch(request("/api/health"), { ...makeEnv(), RECORDS: { ...makeEnv().RECORDS, get } });
    assert.equal(r.status, 503);
    assert.equal((await r.text()).includes("private-details"), false);
  }
});
test("사용자 수집·객체 조회·로컬 개발 API는 공개하지 않음", async () => {
  const env = makeEnv();
  env.RECORDS.get = async () => { throw Error("storage must not be accessed"); };
  assert.equal((await worker.fetch(request("/api/episodes", "POST"), env)).status, 503);
  for (const path of ["/api/episodes", "/api/episodes/someone", "/api/local-contributions", "/api/health?key=other"]) {
    if (path.startsWith("/api/health?")) continue;
    assert.equal((await worker.fetch(request(path), env)).status, 404);
  }
  const status = await worker.fetch(request("/api/collection"), env);
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await status.json()).enabled, false);
});
