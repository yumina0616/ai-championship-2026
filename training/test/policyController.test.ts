import { describe, expect, it } from "vitest";
import * as tf from "@tensorflow/tfjs";
import type { Observation, VehicleSpec } from "../../engine/src/index.js";
import { buildModel } from "../src/model.js";
import { createLearnedController } from "../src/policyController.js";
import { EXPECTED_RAY_COUNT } from "../src/features.js";

const VEHICLE: VehicleSpec = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

function fakeObservation(): Observation {
  return {
    sensors: Array.from({ length: EXPECTED_RAY_COUNT }, (_, i) => ({
      angleRad: i,
      rangeM: 5,
      valid: true,
      updatedSimTimeS: 0,
    })),
    speedMps: 0.3,
    steeringRad: 0.1,
    goalRelative: { xM: 2, yM: 1, yawRad: 0.2 },
  };
}

describe("createLearnedController — 메모리 누수 회귀 검사", () => {
  it("반복 추론해도 tensor가 누적되지 않는다 (리뷰 지적 사항)", () => {
    const model = buildModel(1);
    const controller = createLearnedController(model, VEHICLE);
    const observation = fakeObservation();

    // 워밍업 1회(초기 lazy 초기화로 생기는 일회성 tensor 배제) 후 기준선을 잡는다.
    controller(observation);
    const before = tf.memory().numTensors;

    for (let i = 0; i < 200; i++) controller(observation);

    const after = tf.memory().numTensors;
    // 이전 버전은 입력 tensor를 안 지워서 200회 후 200개 가까이 늘었다(리뷰: 6 -> 206).
    expect(after - before).toBe(0);

    model.dispose();
  });

  it("출력 Command는 유한값이고 vehicle 한계 안에 있다", () => {
    const model = buildModel(2);
    const controller = createLearnedController(model, VEHICLE);
    const command = controller(fakeObservation());

    expect(Number.isFinite(command.targetSpeedMps)).toBe(true);
    expect(Number.isFinite(command.targetSteeringRad)).toBe(true);
    expect(Math.abs(command.targetSteeringRad)).toBeLessThanOrEqual(VEHICLE.maxSteeringRad + 1e-6);

    model.dispose();
  });
});
