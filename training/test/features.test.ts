import { describe, expect, it } from "vitest";
import type { Command, Observation, VehicleSpec } from "../../engine/src/index.js";
import {
  EXPECTED_RAY_COUNT,
  FEATURE_SIZE,
  LABEL_SIZE,
  commandToLabel,
  labelToCommand,
  observationToFeatures,
} from "../src/features.js";

const VEHICLE: VehicleSpec = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

function observation(): Observation {
  return {
    sensors: Array.from({ length: EXPECTED_RAY_COUNT }, (_, i) => ({
      angleRad: i,
      rangeM: i % 2 === 0 ? 3 : 10,
      valid: i % 2 === 0,
      updatedSimTimeS: 0,
    })),
    speedMps: -0.5,
    steeringRad: -0.2,
    goalRelative: { xM: -3, yM: 4, yawRad: -1 },
  };
}

describe("observationToFeatures / commandToLabel / labelToCommand — shape·finite 검사", () => {
  it("항상 FEATURE_SIZE 길이의 유한값 배열을 낸다", () => {
    const features = observationToFeatures(observation(), VEHICLE);
    expect(features).toHaveLength(FEATURE_SIZE);
    for (const value of features) expect(Number.isFinite(value)).toBe(true);
  });

  it("36-ray가 아닌 센서를 받으면 명시적으로 에러를 던진다", () => {
    const bad = observation();
    bad.sensors = bad.sensors.slice(0, 10);
    expect(() => observationToFeatures(bad, VEHICLE)).toThrow();
  });

  it("commandToLabel/labelToCommand는 왕복해도 원래 값에 가깝다(정규화 후 역정규화)", () => {
    const command: Command = { targetSpeedMps: -0.4, targetSteeringRad: 0.3 };
    const label = commandToLabel(command, VEHICLE);
    expect(label).toHaveLength(LABEL_SIZE);
    for (const value of label) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(1 + 1e-9);
    }

    const roundTripped = labelToCommand(label, VEHICLE);
    expect(roundTripped.targetSpeedMps).toBeCloseTo(command.targetSpeedMps, 6);
    expect(roundTripped.targetSteeringRad).toBeCloseTo(command.targetSteeringRad, 6);
  });
});
