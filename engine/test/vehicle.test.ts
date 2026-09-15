import { describe, expect, it } from "vitest";
import { clampCommand, integrateBicycleModel, normalizeAngle } from "../src/vehicle.js";
import type { Command, Pose, VehicleSpec } from "../src/types.js";

const WHEELBASE_M = 2.6;
const DT_S = 0.05;

const VEHICLE: VehicleSpec = {
  wheelbaseM: WHEELBASE_M,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

function origin(): Pose {
  return { xM: 0, yM: 0, yawRad: 0 };
}

describe("integrateBicycleModel", () => {
  it("직진(steer=0)은 x만 증가하고 y/yaw는 불변이다", () => {
    let pose = origin();
    const command: Command = { targetSpeedMps: 0.8, targetSteeringRad: 0 };
    for (let i = 0; i < 40; i++) {
      pose = integrateBicycleModel(pose, command, WHEELBASE_M, DT_S);
    }
    // #2 spike 실측값(0.8mps * 2s = 1.6m)과 동일한 조건.
    expect(pose.xM).toBeCloseTo(1.6, 6);
    expect(pose.yM).toBeCloseTo(0, 9);
    expect(pose.yawRad).toBeCloseTo(0, 9);
  });

  it("왼쪽 조향(steer>0)은 y와 yaw를 양수로 증가시킨다 — '왼쪽 양수' 규칙", () => {
    let pose = origin();
    const command: Command = { targetSpeedMps: 0.5, targetSteeringRad: 0.3 };
    for (let i = 0; i < 40; i++) {
      pose = integrateBicycleModel(pose, command, WHEELBASE_M, DT_S);
    }
    expect(pose.yM).toBeGreaterThan(0);
    expect(pose.yawRad).toBeGreaterThan(0);
  });

  it("오른쪽 조향(steer<0)은 y와 yaw를 음수로 움직인다", () => {
    let pose = origin();
    const command: Command = { targetSpeedMps: 0.5, targetSteeringRad: -0.3 };
    for (let i = 0; i < 40; i++) {
      pose = integrateBicycleModel(pose, command, WHEELBASE_M, DT_S);
    }
    expect(pose.yM).toBeLessThan(0);
    expect(pose.yawRad).toBeLessThan(0);
  });

  it("후진(speed<0)은 진행거리가 줄고 yaw는 고정된다(steer=0)", () => {
    const forward = integrateBicycleModel(
      { xM: 2.0, yM: 0, yawRad: 0 },
      { targetSpeedMps: -0.5, targetSteeringRad: 0 },
      WHEELBASE_M,
      DT_S
    );
    expect(forward.xM).toBeLessThan(2.0);
    expect(forward.yawRad).toBeCloseTo(0, 9);
  });

  it("동일 입력을 재실행하면 완전히 같은 결과를 낸다(결정론적, 허용오차 0)", () => {
    const run = () => {
      let pose = origin();
      const command: Command = { targetSpeedMps: 0.5, targetSteeringRad: 0.3 };
      for (let i = 0; i < 40; i++) pose = integrateBicycleModel(pose, command, WHEELBASE_M, DT_S);
      return pose;
    };
    expect(run()).toEqual(run());
  });
});

describe("normalizeAngle", () => {
  it("[-pi, pi) 범위로 정규화한다", () => {
    expect(normalizeAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1, 9);
    expect(normalizeAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 9);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(-Math.PI, 9);
  });
});

describe("clampCommand", () => {
  const zero: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

  it("vehicle spec의 절대 한계를 넘는 요청을 clamp한다", () => {
    const applied = clampCommand(
      { targetSpeedMps: 999, targetSteeringRad: 999 },
      zero,
      VEHICLE,
      DT_S
    );
    expect(applied.targetSpeedMps).toBeLessThanOrEqual(VEHICLE.maxForwardSpeedMps);
    expect(applied.targetSteeringRad).toBeLessThanOrEqual(VEHICLE.maxSteeringRad);
  });

  it("후진 한계(maxReverseSpeedMps)도 별도로 clamp한다", () => {
    const applied = clampCommand(
      { targetSpeedMps: -999, targetSteeringRad: 0 },
      zero,
      VEHICLE,
      DT_S
    );
    expect(applied.targetSpeedMps).toBeGreaterThanOrEqual(-VEHICLE.maxReverseSpeedMps);
  });

  it("변화율 제한: 이전 명령에서 한 dt 동안 너무 크게 바뀌면 clamp한다", () => {
    const previous: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };
    const applied = clampCommand(
      { targetSpeedMps: 1.5, targetSteeringRad: 0.55 },
      previous,
      VEHICLE,
      DT_S
    );
    // 기본 가속/조향속도 한계(engine.ts 기본값) 내로 제한되어 요청값보다 작아야 한다.
    expect(Math.abs(applied.targetSpeedMps)).toBeLessThan(1.5);
    expect(Math.abs(applied.targetSteeringRad)).toBeLessThan(0.55);
  });
});
