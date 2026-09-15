import { describe, expect, it } from "vitest";
import { FIXED_DT_S, ParkingEngine } from "../src/engine.js";
import type { Scenario } from "../src/types.js";

const VEHICLE = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

const SENSOR = {
  id: "front",
  poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
  rayCount: 1,
  angleMinRad: 0,
  angleIncrementRad: 0,
  maxRangeM: 10,
  periodS: FIXED_DT_S,
  noiseStdM: 0,
};

function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    scenarioId: "test-success",
    vehicle: VEHICLE,
    bounds: { minX: -5, maxX: 20, minY: -5, maxY: 14 },
    start: { xM: 0, yM: 0, yawRad: 0 },
    obstacles: [],
    timeoutSimS: 90,
    sensor: SENSOR,
    goalPose: { xM: 3, yM: 0, yawRad: 0 },
    goalSpace: { centerXM: 4.3, centerYM: 0, lengthM: 4.6, widthM: 2.0, yawRad: 0 },
    successCriteria: {
      positionToleranceM: 0.5,
      yawToleranceRad: 0.1,
      stoppedSpeedMps: 0.05,
      holdTimeS: 0.2,
      requireFootprintInsideGoal: true,
      collisionTerminates: true,
    },
    seed: 1,
    ...overrides,
  };
}

describe("ParkingEngine — 성공 판정", () => {
  it("목표 pose에서 정지 상태를 hold_time_s 이상 유지하면 success로 종료된다", () => {
    const engine = new ParkingEngine();
    engine.reset(baseScenario({ start: { xM: 3, yM: 0, yawRad: 0 } })); // 이미 목표 위치에서 시작
    let result;
    for (let i = 0; i < 10; i++) {
      result = engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 }, FIXED_DT_S);
      if (result.outcome.terminated) break;
    }
    expect(result!.outcome).toEqual({ terminated: true, reason: "success" });
  });

  it("hold_time_s를 채우기 전에 조건을 벗어나면 타이머가 리셋된다(다시 채워야 성공)", () => {
    const engine = new ParkingEngine();
    engine.reset(baseScenario({ start: { xM: 3, yM: 0, yawRad: 0 } }));
    // 1step 대기 후 살짝 움직여서 조건을 깬다.
    engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 }, FIXED_DT_S);
    const moved = engine.step({ targetSpeedMps: 1.5, targetSteeringRad: 0 }, FIXED_DT_S);
    expect(moved.outcome.terminated).toBe(false);
    // 곧바로 멈춰도 hold_time_s(0.2s=4step)를 다시 채워야 한다 — 1step만에 성공하면 안 됨.
    const rightAfterStop = engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 }, FIXED_DT_S);
    expect(rightAfterStop.outcome.terminated).toBe(false);
  });

  it("속도가 stopped_speed_mps를 넘으면 위치가 맞아도 성공 처리하지 않는다", () => {
    const engine = new ParkingEngine();
    engine.reset(baseScenario({ start: { xM: 3, yM: 0, yawRad: 0 } }));
    const result = engine.step({ targetSpeedMps: 1.5, targetSteeringRad: 0 }, FIXED_DT_S);
    expect(result.outcome.terminated).toBe(false);
  });

  it("위치 오차가 position_tolerance_m을 넘으면 성공 처리하지 않는다", () => {
    const engine = new ParkingEngine();
    engine.reset(baseScenario({ start: { xM: 0, yM: 0, yawRad: 0 } })); // 목표(3,0)와 3m 떨어짐
    const result = engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 }, FIXED_DT_S);
    expect(result.outcome.terminated).toBe(false);
  });

  it("목표 공간을 막고 있는 장애물이 있으면 success가 아니라 collision으로 종료된다 (충돌 우선 원칙)", () => {
    // 정확히 같은 step에서 두 조건이 동시에 true가 되는 경계 케이스를 손으로 맞추긴 어렵지만,
    // evaluateOutcome()이 충돌을 먼저 검사하고 반환하므로(코드 순서 자체가 우선순위) 이 경로로는
    // 절대 success가 먼저 보고되지 않는다는 것을 실제 실행으로 확인한다.
    const engine = new ParkingEngine();
    // 목표 공간(goalSpace) 한가운데 작은 장애물을 둬서, 목표로 가는 경로 자체를 막는다.
    engine.reset(
      baseScenario({
        obstacles: [{ id: "obstacle-in-goal", centerXM: 4.3, centerYM: 0, lengthM: 0.5, widthM: 0.5, yawRad: 0 }],
      })
    );
    let result;
    let sawSuccess = false;
    for (let i = 0; i < 400; i++) {
      result = engine.step({ targetSpeedMps: 0.8, targetSteeringRad: 0 }, FIXED_DT_S);
      if (result.outcome.reason === "success") sawSuccess = true;
      if (result.outcome.terminated) break;
    }
    expect(sawSuccess).toBe(false);
    expect(result!.outcome).toEqual({ terminated: true, reason: "collision" });
  });
});
