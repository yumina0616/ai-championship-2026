// 수집과 학습은 분리한다. 원본 다운로드/정제/후보 비교는 운영자가 수동 실행한다.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ParkingEngine, type Scenario, type StepResult } from "../../engine/src/index.js";
import { readCollectionRecord, RETENTION_DAYS } from "../../web/src/collection-record.js";
import type { LocalEpisode } from "../../web/src/episodes.js";
import { observationToFeatures, commandToLabel } from "./features.js";
import { runLearnedEpisode } from "./evaluate.js";
import { loadModelFromDisk } from "./modelIO.js";
import { createLearnedController } from "./policyController.js";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2), { flag: "wx", mode: 0o600 });
const idPattern = /^[a-f0-9]{64}$/;
// 시작점/goal/seed만 바뀐 같은 주차장을 서로 다른 분할로 누출하지 않는다.
export const layoutKey = (s: Scenario) => digest(JSON.stringify({
  bounds: s.bounds,
  obstacles: s.obstacles.map(({ id: _id, ...o }) => o).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
}));
function near(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-6;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y, k) && near(x[k], y[k]));
  }
  return a === b;
}
export function verifyReplay(e: LocalEpisode) {
  const engine = new ParkingEngine();
  if (!near(engine.reset(e.header.scenarioSnapshot), e.initial.observation)) throw Error("initial_observation_mismatch");
  for (const step of e.steps) {
    const actual: StepResult = engine.step(step.requestedActionT);
    if (!near(actual.poseTruth, step.nextStateTruth) || !near(actual.observation, step.nextObservation) ||
        !near(actual.appliedCommand, step.appliedCommandT) || !near(actual.outcome, step.nextOutcome)) throw Error("engine_replay_mismatch");
  }
}
export type Review = { id: string; split: "train" | "validation" | "heldout"; observationReviewed: boolean; layoutGroup: string };
export function curate(entries: { id: string; record: unknown }[], reviews: Review[]) {
  const seen = new Set<string>(), groups = new Map<string, string>(), layouts = new Map<string, string>();
  const trajectories = new Set<string>();
  const byId = new Map(entries.map(e => [e.id, e]));
  const samples: Record<"train" | "validation", { features: number[]; label: number[] }[]> = { train: [], validation: [] };
  const heldout: { scenarioId: string; scenario: Scenario }[] = [], accepted: unknown[] = [];
  const heldoutKeys = new Set<string>();
  for (const review of reviews) {
    if (!idPattern.test(review.id) || seen.has(review.id) || !["train", "validation", "heldout"].includes(review.split) ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(review.layoutGroup)) throw Error("invalid_review");
    seen.add(review.id);
    const entry = byId.get(review.id);
    if (!entry) throw Error("missing_or_revoked_record");
    const { episode: e, record } = readCollectionRecord(JSON.stringify(entry.record));
    const trajectory = digest(JSON.stringify(record));
    if (trajectories.has(trajectory)) throw Error("duplicate_trajectory");
    trajectories.add(trajectory);
    verifyReplay(e);
    const layout = layoutKey(e.header.scenarioSnapshot);
    if ((groups.has(review.layoutGroup) && groups.get(review.layoutGroup) !== review.split) ||
        (layouts.has(layout) && layouts.get(layout) !== review.split)) throw Error("layout_split_leakage");
    groups.set(review.layoutGroup, review.split); layouts.set(layout, review.split);
    if (review.split === "heldout") {
      if (!heldoutKeys.has(layout)) {
        heldoutKeys.add(layout);
        heldout.push({ scenarioId: layout, scenario: e.header.scenarioSnapshot });
      }
    } else {
      if (e.header.controllerKind !== "human" || !e.footer.success || !e.footer.logComplete || !review.observationReviewed ||
          e.steps.some(s => ["top", "orbit"].includes(s.rawInput.viewMode))) throw Error("not_eligible_for_behavior_cloning");
      samples[review.split].push(...e.steps.map(s => ({
        features: observationToFeatures(s.observationT, e.header.scenarioSnapshot.vehicle),
        label: commandToLabel(s.appliedCommandT, e.header.scenarioSnapshot.vehicle),
      })));
    }
    accepted.push({ ...review, layout, digest: trajectory });
  }
  return { samples, heldout, accepted };
}
export function promotionDecision(current: { success: boolean; collided: boolean; terminationReason: string }[], candidate: typeof current) {
  const successes = (r: typeof current) => r.filter(x => x.success).length;
  const collisions = (r: typeof current) => r.filter(x => x.collided).length;
  return current.length >= 10 && current.length === candidate.length &&
    successes(candidate) > successes(current) && collisions(candidate) <= collisions(current) &&
    candidate.every(r => ["success", "collision", "timeout"].includes(r.terminationReason));
}
async function exportRecords(out: string) {
  const base = process.env.MR_PARK_URL, token = process.env.COLLECTION_ADMIN_TOKEN;
  if (!base || !token || new URL(base).protocol !== "https:") throw Error("MR_PARK_URL(https)와 COLLECTION_ADMIN_TOKEN이 필요합니다.");
  mkdirSync(out, { recursive: false, mode: 0o700 });
  const get = async (path: string) => {
    const response = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`export_http_${response.status}`);
    return response.json();
  };
  const records: { id: string; digest: string; receivedDay: string }[] = [];
  let cursor: string | null = null;
  do {
    const page = await get(`/api/admin/records${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!page || !Array.isArray(page.keys)) throw Error("invalid_export_page");
    for (const key of page.keys) {
      if (typeof key !== "string" || !/^episodes\/[a-f0-9]{64}\.json$/.test(key)) throw Error("invalid_object_key");
      const id = key.slice(9, -5), value = await get(`/api/admin/records/${id}`);
      if (!value) continue; // 다운로드 중 삭제된 기록
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.receivedDay) || Date.now() - Date.parse(value.receivedDay) >= RETENTION_DAYS * 86400000) continue;
      const record = readCollectionRecord(JSON.stringify(value.record)).record;
      write(`${out}/${id}.json`, record);
      records.push({ id, digest: digest(JSON.stringify(record)), receivedDay: value.receivedDay });
    }
    cursor = page.cursor;
  } while (cursor);
  write(`${out}/manifest.json`, { schema: "mr-park-export.v1", exportedAt: new Date().toISOString(), records });
  console.log(`다운로드 ${records.length}건. 자동 학습/모델 교체는 하지 않았습니다.`);
}
async function main() {
  const [command, a, b, c, d] = process.argv.slice(2);
  if (command === "export" && a) return exportRecords(resolve(a));
  if (command === "prepare" && a && b && c) {
    const manifest = read(`${a}/manifest.json`);
    if (manifest.schema !== "mr-park-export.v1" || !Number.isFinite(Date.parse(manifest.exportedAt)) || Date.now() - Date.parse(manifest.exportedAt) > 86400000) throw Error("학습 전 24시간 이내에 새로 export하세요.");
    const entries = manifest.records.map((r: { id: string; digest: string; receivedDay: string }) => {
      if (!idPattern.test(r.id) || !Number.isFinite(Date.parse(r.receivedDay)) || Date.now() - Date.parse(r.receivedDay) >= RETENTION_DAYS * 86400000) throw Error("expired_record");
      const record = read(`${a}/${r.id}.json`);
      if (digest(JSON.stringify(record)) !== r.digest) throw Error("checksum_mismatch");
      return { id: r.id, record };
    });
    const result = curate(entries, read(b));
    if (!result.samples.train.length || !result.samples.validation.length || !result.heldout.length) throw Error("train/validation/heldout 데이터가 아직 부족합니다. 모델은 유지하세요.");
    mkdirSync(c, { recursive: false, mode: 0o700 });
    write(`${c}/train.json`, result.samples.train); write(`${c}/validation.json`, result.samples.validation);
    write(`${c}/heldout-scenarios.json`, result.heldout);
    write(`${c}/community-manifest.json`, { schema: "mr-park-dataset.v1", createdAt: new Date().toISOString(), source: manifest, accepted: result.accepted,
      files: Object.fromEntries(["train.json", "validation.json", "heldout-scenarios.json"].map(f => [f, digest(readFileSync(`${c}/${f}`, "utf8"))])) });
    return;
  }
  if (command === "compare" && a && b && c && d) {
    const data = read(`${a}/community-manifest.json`), scenarios = read(`${a}/heldout-scenarios.json`) as { scenarioId: string; scenario: Scenario }[];
    if (digest(readFileSync(`${a}/heldout-scenarios.json`, "utf8")) !== data.files["heldout-scenarios.json"] ||
        JSON.stringify(read(`${c}/train-run.json`).communityDataset) !== JSON.stringify(data)) throw Error("candidate_dataset_lineage_mismatch");
    if (new Set(scenarios.map(e => layoutKey(e.scenario))).size !== scenarios.length) throw Error("duplicate_evaluation_layout");
    const models = await Promise.all([loadModelFromDisk(`${b}/model.json`), loadModelFromDisk(`${c}/model.json`)]);
    try {
      const results = models.map(model => scenarios.map(s => runLearnedEpisode(s.scenario, createLearnedController(model, s.scenario.vehicle))));
      write(d, { datasetDigest: digest(JSON.stringify(data)), evaluatedAt: new Date().toISOString(),
        modelDigests: [b, c].map(dir => digest(readFileSync(`${dir}/model.json`, "utf8") + readFileSync(`${dir}/weights.bin`).toString("hex"))),
        current: results[0], candidate: results[1], eligibleForReview: promotionDecision(results[0], results[1]),
        deployed: false, note: "최소 10개 서로 다른 평가 레이아웃, 성공 증가·충돌 비증가·실행 오류 없음. 통계적 유의성 보장 아님. 이전 모델 학습 레이아웃과도 분리됐는지 팀원 검토 필요." });
    } finally { models.forEach(m => m.dispose()); }
    return;
  }
  throw Error("community export <새 폴더> | prepare <export 폴더> <review.json> <새 dataset 폴더> | compare <dataset 폴더> <현재 모델 폴더> <후보 모델 폴더> <새 report.json>");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("작업 실패: 입력·유효기간·분할·검증 또는 서버 연결을 확인하세요. 원본/토큰은 로그에 출력하지 않습니다."); process.exitCode = 1;
});
