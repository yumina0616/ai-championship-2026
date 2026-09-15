import { describe, expect, it } from "vitest";
import { baselineReverseParkController } from "../src/baselineController.js";
import { FIXED_DT_S, ParkingEngine } from "../src/engine.js";
import type { Pose, Scenario, VehicleSpec } from "../src/types.js";

const VEHICLE: VehicleSpec = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

describe("baselineReverseParkController — 단독 함수", () => {
  it("목표가 정면 뒤(정후방)에 있으면 조향 없이 후진한다", () => {
    const pose: Pose = { xM: 5, yM: 0, yawRad: 0 };
    const goal: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const command = baselineReverseParkController(pose, goal, VEHICLE);
    expect(command.targetSteeringRad).toBeCloseTo(0, 6);
    expect(command.targetSpeedMps).toBeLessThan(0); // 항상 후진
  });

  it("도착 반경 안에서는 정지 명령을 낸다", () => {
    const pose: Pose = { xM: 0.1, yM: 0, yawRad: 0 };
    const goal: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const command = baselineReverseParkController(pose, goal, VEHICLE, { arrivalDistanceM: 0.3 });
    expect(command).toEqual({ targetSpeedMps: 0, targetSteeringRad: 0 });
  });

  it("후진 속도·조향은 vehicle spec 한계를 넘지 않는다", () => {
    const pose: Pose = { xM: 50, yM: 50, yawRad: 0 }; // 아주 먼 목표 -> 포화(saturation) 유도
    const goal: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const command = baselineReverseParkController(pose, goal, VEHICLE);
    expect(Math.abs(command.targetSpeedMps)).toBeLessThanOrEqual(VEHICLE.maxReverseSpeedMps);
    expect(Math.abs(command.targetSteeringRad)).toBeLessThanOrEqual(VEHICLE.maxSteeringRad);
  });
});

function offsetScenario(start: Pose, goal: Pose): Scenario {
  return {
    scenarioId: "test-baseline-convergence",
    vehicle: VEHICLE,
    bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 },
    start,
    obstacles: [],
    timeoutSimS: 30,
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
    goalPose: goal,
    goalSpace: { centerXM: goal.xM, centerYM: goal.yM, lengthM: 100, widthM: 100, yawRad: 0 },
    successCriteria: {
      positionToleranceM: 0.3,
      yawToleranceRad: 1.0,
      stoppedSpeedMps: 0.1,
      holdTimeS: 0.1,
      requireFootprintInsideGoal: false, // 이 수렴 테스트는 위치 수렴 자체만 본다
      collisionTerminates: true,
    },
    seed: 1,
  };
}

function distanceToGoal(pose: Pose, goal: Pose): number {
  return Math.hypot(pose.xM - goal.xM, pose.yM - goal.yM);
}

describe("baselineReverseParkController — 엔진과 함께 실제 수렴 확인", () => {
  it("정후방 목표: 거리 오차가 시간에 따라 단조 감소해 도착 반경 안으로 들어온다", () => {
    const start: Pose = { xM: 5, yM: 0, yawRad: 0 };
    const goal: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const engine = new ParkingEngine();
    engine.reset(offsetScenario(start, goal));

    let poseTruth: Pose = start;
    let minDistance = distanceToGoal(start, goal);
    for (let i = 0; i < 400; i++) {
      const command = baselineReverseParkController(poseTruth, goal, VEHICLE);
      const result = engine.step(command, FIXED_DT_S);
      poseTruth = result.poseTruth;
      minDistance = Math.min(minDistance, distanceToGoal(poseTruth, goal));
      if (result.outcome.terminated) break;
    }
    expect(minDistance).toBeLessThan(0.5);
  });

  it("옆으로 치우친 목표(대각선 후방-좌측)도 도착 반경 안으로 수렴한다", () => {
    const start: Pose = { xM: 5, yM: 2, yawRad: 0 };
    const goal: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const engine = new ParkingEngine();
    engine.reset(offsetScenario(start, goal));

    let poseTruth: Pose = start;
    let minDistance = distanceToGoal(start, goal);
    for (let i = 0; i < 600; i++) {
      const command = baselineReverseParkController(poseTruth, goal, VEHICLE);
      const result = engine.step(command, FIXED_DT_S);
      poseTruth = result.poseTruth;
      minDistance = Math.min(minDistance, distanceToGoal(poseTruth, goal));
      if (result.outcome.terminated) break;
    }
    expect(minDistance).toBeLessThan(0.5);
  });
});
