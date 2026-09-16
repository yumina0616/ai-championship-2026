import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXED_DT_S, ParkingEngine } from "../src/engine.js";
import {
  appendHoldCommands,
  flattenPrimitiveTargetsToCommands,
  planHybridAStar,
} from "../src/hybridAStar.js";
import { runHybridAStarRollout } from "../src/rollout.js";
import { loadScenarioFromJson, type ScenarioJson } from "../src/scenarioLoader.js";
import type { RectObstacle, Scenario } from "../src/types.js";

const VEHICLE = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

function scenario(overrides: Partial<Scenario> & { obstacles?: RectObstacle[] } = {}): Scenario {
  return {
    scenarioId: "hybrid-astar-test",
    vehicle: VEHICLE,
    bounds: { minX: -10, maxX: 20, minY: -10, maxY: 20 },
    start: { xM: 5, yM: 0, yawRad: 0 },
    obstacles: [],
    timeoutSimS: 60,
    sensor: {
      id: "front",
      poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
      rayCount: 1,
      angleMinRad: 0,
      angleIncrementRad: 0,
      maxRangeM: 10,
      periodS: FIXED_DT_S,
      noiseStdM: 0,
    },
    goalPose: { xM: 0, yM: 0, yawRad: 0 },
    goalSpace: { centerXM: 0, centerYM: 0, lengthM: 100, widthM: 100, yawRad: 0 },
    successCriteria: {
      positionToleranceM: 0.3,
      yawToleranceRad: 0.3,
      stoppedSpeedMps: 0.5,
      holdTimeS: 0.1,
      requireFootprintInsideGoal: false,
      collisionTerminates: true,
    },
    seed: 1,
    ...overrides,
  };
}

function replay(target: Scenario, primitiveTargets: ReturnType<typeof planHybridAStar>["primitiveTargets"]) {
  const commands = appendHoldCommands(target, flattenPrimitiveTargetsToCommands(target, primitiveTargets));
  const engine = new ParkingEngine();
  engine.reset(target);
  let outcome;
  for (const command of commands) {
    const result = engine.step(command, FIXED_DT_S);
    outcome = result.outcome;
    if (outcome.terminated) break;
  }
  return outcome;
}

describe("planHybridAStar", () => {
  it("장애물 없는 시나리오는 빠르게 계획하고 실제 engine 재생도 success로 끝난다", () => {
    const s = scenario();
    const result = planHybridAStar(s);
    expect(result.found).toBe(true);
    expect(replay(s, result.primitiveTargets)).toEqual({ terminated: true, reason: "success" });
  });

  it("직선 경로를 막는 장애물이 있으면 돌아가는 경로를 찾는다(충돌 없이 도착)", () => {
    // reverse-bay.v1.json(실제 주차 시나리오, 훨씬 빽빽함)은 별도 테스트에서 이미 검증하므로
    // 여기서는 "장애물을 만나면 최단 직선을 포기하고 돌아간다"는 기본 동작만 가볍게 확인한다.
    // start->goal이 전진 방향이 되도록 둔다(후진으로 장애물을 피하는 건 원래 더 어려운 조작).
    // 차체 footprint가 4.4m라 start(x=0)에서 x=3.5까지는 이미 차체 범위 — 장애물을 그보다
    // 확실히 앞(x=5.5)에 둬서 "시작부터 겹침"이 되지 않게 한다.
    const s = scenario({
      start: { xM: 0, yM: 0, yawRad: 0 },
      goalPose: { xM: 9, yM: 0, yawRad: 0 },
      goalSpace: { centerXM: 9, centerYM: 0, lengthM: 100, widthM: 100, yawRad: 0 },
      bounds: { minX: -10, maxX: 20, minY: -10, maxY: 10 },
      obstacles: [{ id: "blocker", centerXM: 5.5, centerYM: 0, lengthM: 1, widthM: 1.5, yawRad: 0 }],
    });
    const result = planHybridAStar(s);
    expect(result.found).toBe(true);
    expect(replay(s, result.primitiveTargets)).toEqual({ terminated: true, reason: "success" });
  }, 20000);

  it("완전히 막힌(도달 불가능한) 목표는 found=false를 반환한다", () => {
    // 목표를 사방이 막힌 박스 안에 둔다 — 차량 footprint(폭 1.8m)가 들어갈 틈이 없다.
    const s = scenario({
      goalPose: { xM: 0, yM: 0, yawRad: 0 },
      obstacles: [
        { id: "n", centerXM: 0, centerYM: 1.0, lengthM: 3, widthM: 0.2, yawRad: 0 },
        { id: "s", centerXM: 0, centerYM: -1.0, lengthM: 3, widthM: 0.2, yawRad: 0 },
        { id: "e", centerXM: 1.5, centerYM: 0, lengthM: 0.2, widthM: 2, yawRad: 0 },
        { id: "w", centerXM: -1.5, centerYM: 0, lengthM: 0.2, widthM: 2, yawRad: 0 },
      ],
    });
    const result = planHybridAStar(s, { maxExpansions: 5000 });
    expect(result.found).toBe(false);
  }, 40000); // 정지 시뮬레이션(관성 오버슈트 검사) 때문에 노드당 비용이 늘어 시간 여유를 더 둔다.

  it("실제 examples/scenarios/reverse-bay.v1.json(주차된 옆 차량 2대+기둥)에서 충돌 없이 목표에 도착한다", () => {
    const text = readFileSync(new URL("../../examples/scenarios/reverse-bay.v1.json", import.meta.url));
    const json: ScenarioJson = JSON.parse(text.toString());
    const s = loadScenarioFromJson(json);

    const rolloutResult = runHybridAStarRollout(s, { episodeId: "ep-reverse-bay-hybrid-astar" });
    expect(rolloutResult.planFound).toBe(true);
    expect(rolloutResult.episode).not.toBeNull();
    expect(rolloutResult.episode!.footer.terminationReason).toBe("success");
    expect(rolloutResult.episode!.footer.collided).toBe(false);
  }, 20000);
});
