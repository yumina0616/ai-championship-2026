// 운영자가 명시적으로 실행하는 합성 원격 검사. 실제 사용자 기록은 사용하지 않는다.
import { ParkingEngine, type StepResult } from "../engine/src/index";
import { makeScenario } from "../web/src/scenario";
import { beginEpisode, appendStep, finishEpisode } from "../web/src/episodes";
import { collectionRecord } from "../web/src/collection-record";

const base = process.argv[2];
if (!base || new URL(base).protocol !== "https:") throw Error("검증할 공개 HTTPS 주소가 필요합니다.");
const origin = new URL(base).origin;
const scenario = makeScenario("open"), engine = new ParkingEngine();
const command = { targetSpeedMps: 0, targetSteeringRad: 0 };
let before: StepResult = { observation: engine.reset(scenario), poseTruth: scenario.start, simTimeS: 0, appliedCommand: command, outcome: { terminated: false, reason: null } };
const context = { viewMode: "follow", assistanceFlags: [] };
const e = beginEpisode(scenario, before, context);
while (!before.outcome.terminated) {
  const next = engine.step(command);
  appendStep(e, before, command, next, { ...context, gear: "P", inputs: [], analogSteer: null });
  before = next;
}
const body = JSON.stringify(collectionRecord(finishEpisode(e, "timeout")));
const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
const headers = { Origin: origin, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
try {
  const response = await fetch(`${origin}/api/episodes`, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) });
  console.log(JSON.stringify({ synthetic: true, steps: e.steps.length, bytes: Buffer.byteLength(body), status: response.status }));
  if (response.status !== 201) { console.log((await response.text()).slice(0, 200)); throw Error("synthetic_upload_failed"); }
  const duplicate = await fetch(`${origin}/api/episodes`, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) });
  if (duplicate.status !== 200) throw Error("idempotency_failed");
} finally {
  const removed = await fetch(`${origin}/api/episodes`, { method: "DELETE", headers, signal: AbortSignal.timeout(30000) });
  console.log(JSON.stringify({ syntheticDeleted: removed.ok, deleteStatus: removed.status }));
  if (!removed.ok) throw Error("synthetic_cleanup_failed");
}
