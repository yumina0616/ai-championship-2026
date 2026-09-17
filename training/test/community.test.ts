import { describe, it, expect } from "vitest";
import { ParkingEngine, type StepResult } from "../../engine/src/index";
import { makeScenario } from "../../web/src/scenario";
import { beginEpisode, appendStep, finishEpisode } from "../../web/src/episodes";
import { collectionRecord } from "../../web/src/collection-record";
import { newMap, mapScenario, parseMap } from "../../web/src/maps";
import { curate, verifyReplay, promotionDecision, layoutKey } from "../src/community";

function sample() {
  const s = makeScenario("open"), engine = new ParkingEngine(), command = { targetSpeedMps: 0, targetSteeringRad: 0 };
  const before: StepResult = { observation: engine.reset(s), poseTruth: s.start, simTimeS: 0, appliedCommand: command, outcome: { terminated: false, reason: null } };
  const context = { viewMode: "follow", assistanceFlags: [] };
  const e = beginEpisode(s, before, context);
  appendStep(e, before, command, engine.step(command), { ...context, gear: "P", inputs: [], analogSteer: null });
  return finishEpisode(e, "user_abort");
}
describe("참여 데이터는 검증 전 학습/승격하지 않는다", () => {
  const success = (x: number) => {
    const map = newMap("open");
    map.obstacles[0].centerXM = x;
    map.start = { xM: 0, yM: 2.9, yawRad: -Math.PI / 2 };
    const scenario = mapScenario(parseMap(JSON.stringify(map))), engine = new ParkingEngine();
    const command = { targetSpeedMps: 0, targetSteeringRad: 0 }, context = { viewMode: "follow", assistanceFlags: [] };
    let before: StepResult = { observation: engine.reset(scenario), poseTruth: scenario.start, simTimeS: 0, appliedCommand: command, outcome: { terminated: false, reason: null } };
    const episode = beginEpisode(scenario, before, context);
    for (let i = 0; i < 30 && !before.outcome.terminated; i++) {
      const next = engine.step(command);
      appendStep(episode, before, command, next, { ...context, gear: "P", inputs: [], analogSteer: null });
      before = next;
    }
    return collectionRecord(finishEpisode(episode, before.outcome.reason!));
  };
  it("검증된 성공 기록만 동일 feature 계약으로 변환하고 heldout 프레임은 학습에 넣지 않음", () => {
    const entries = [-6, -5.8, -5.6].map((x, i) => ({ id: String(i + 1).repeat(64), record: success(x) }));
    const splits = ["train", "validation", "heldout"] as const;
    const result = curate(entries, entries.map((e, i) => ({ id: e.id, split: splits[i], observationReviewed: true, layoutGroup: `test-${i}` })));
    expect(result.samples.train).toHaveLength(entries[0].record.steps.length);
    expect(result.samples.validation).toHaveLength(entries[1].record.steps.length);
    expect(result.samples.train[0].features).toHaveLength(41);
    expect(result.heldout).toHaveLength(1);
  });
  it("같은 레이아웃의 분할 누출·중복 기록은 거부", () => {
    const a = success(-6), b = structuredClone(a);
    b.header.assistanceFlags = ["parking-status"];
    const entries = [{ id: "a".repeat(64), record: a }, { id: "b".repeat(64), record: b }];
    const reviews = entries.map((e, i) => ({ id: e.id, split: i === 0 ? "train" as const : "heldout" as const, observationReviewed: true, layoutGroup: `claimed-${i}` }));
    expect(() => curate(entries, reviews)).toThrow("layout_split_leakage");
    entries[1].record = a;
    expect(() => curate(entries, reviews)).toThrow("duplicate_trajectory");
  });
  it("동일 엔진 센서를 재계산해 조작된 수치를 거부", () => {
    const e = sample(); expect(() => verifyReplay(e)).not.toThrow();
    e.steps[0].nextObservation.sensors[0].rangeM = 0;
    expect(() => verifyReplay(e)).toThrow("engine_replay_mismatch");
  });
  it("실패는 분석/heldout 용도로 남기고 행동복제 라벨에는 넣지 않음", () => {
    const id = "a".repeat(64), entries = [{ id, record: collectionRecord(sample()) }];
    const review = { id, split: "train" as const, observationReviewed: true, layoutGroup: "open" };
    expect(() => curate(entries, [review])).toThrow("not_eligible");
    expect(curate(entries, [{ ...review, split: "heldout" }]).heldout).toHaveLength(1);
    expect(() => curate([], [review])).toThrow("missing_or_revoked");
  });
  it("시작점/장애물 ID만 바꿔서는 새로운 레이아웃이 아님", () => {
    const a = makeScenario("open"), b = structuredClone(a);
    b.start.xM += 1; b.obstacles[0].id = "another";
    expect(layoutKey(a)).toBe(layoutKey(b));
  });
  it("악화/표본 부족/오류 후보는 승격하지 않음", () => {
    const fail = { success: false, collided: true, terminationReason: "collision" };
    const good = { success: true, collided: false, terminationReason: "success" };
    expect(promotionDecision([fail], [good])).toBe(false);
    expect(promotionDecision(Array(10).fill(good), Array(10).fill(fail))).toBe(false);
    expect(promotionDecision(Array(10).fill(fail), Array(10).fill(good))).toBe(true);
    expect(promotionDecision(Array(10).fill(fail), [...Array(9).fill(good), { ...fail, terminationReason: "incomplete" }])).toBe(false);
  });
});
