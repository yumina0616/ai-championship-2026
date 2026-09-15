import { describe, expect, it } from "vitest";
import { computeSensorScan } from "../src/sensor.js";
import { createRng } from "../src/rng.js";
import type { Pose, RectObstacle, SensorSpec } from "../src/types.js";

const ORIGIN: Pose = { xM: 0, yM: 0, yawRad: 0 };

function forwardSensor(overrides: Partial<SensorSpec> = {}): SensorSpec {
  return {
    id: "front",
    poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
    rayCount: 1,
    angleMinRad: 0,
    angleIncrementRad: 0,
    maxRangeM: 10,
    periodS: 0.05,
    noiseStdM: 0,
    ...overrides,
  };
}

function wall(centerXM: number, centerYM = 0, lengthM = 0.2, widthM = 4): RectObstacle {
  return { id: "wall", centerXM, centerYM, lengthM, widthM, yawRad: 0 };
}

describe("computeSensorScan", () => {
  it("정면 벽까지 거리를 #2 spike 실측값(5.1m)과 동일하게 계산한다", () => {
    const readings = computeSensorScan(ORIGIN, forwardSensor(), [wall(6.5)], 0, createRng(0));
    expect(readings[0]!.rangeM).toBeCloseTo(5.1, 6);
    expect(readings[0]!.valid).toBe(true);
  });

  it("범위 안에 아무것도 없으면 미검출: range=maxRange, valid=true (0m로 대체하지 않음)", () => {
    const readings = computeSensorScan(ORIGIN, forwardSensor(), [], 0, createRng(0));
    expect(readings[0]!.rangeM).toBe(10);
    expect(readings[0]!.valid).toBe(true);
  });

  it("장애물이 max_range_m보다 멀면 미검출로 취급한다", () => {
    const readings = computeSensorScan(ORIGIN, forwardSensor(), [wall(50)], 0, createRng(0));
    expect(readings[0]!.rangeM).toBe(10);
  });

  it("차량이 이동하면(장애물 고정) 거리가 그만큼 줄어든다 — 연출이 아니라 재계산", () => {
    const before = computeSensorScan(ORIGIN, forwardSensor(), [wall(6.5)], 0, createRng(0));
    const moved: Pose = { xM: 1.6, yM: 0, yawRad: 0 };
    const after = computeSensorScan(moved, forwardSensor(), [wall(6.5)], 0.05, createRng(0));
    expect(before[0]!.rangeM - after[0]!.rangeM).toBeCloseTo(1.6, 6);
  });

  it("가림(occlusion): 가까운 장애물이 먼 장애물을 가린다 — 더 가까운 거리를 반환한다", () => {
    const readings = computeSensorScan(
      ORIGIN,
      forwardSensor(),
      [wall(6.5), wall(3.0)],
      0,
      createRng(0)
    );
    expect(readings[0]!.rangeM).toBeCloseTo(3.0 - 0.1 - 1.3, 6); // 가까운 wall(3.0)까지 거리
  });

  it("장애물을 회전시키면 정면 거리도 바뀐다", () => {
    const straight = wall(6.5, 0, 0.2, 4);
    const rotated: RectObstacle = { ...straight, yawRad: Math.PI / 4 };
    const readingsStraight = computeSensorScan(ORIGIN, forwardSensor(), [straight], 0, createRng(0));
    const readingsRotated = computeSensorScan(ORIGIN, forwardSensor(), [rotated], 0, createRng(0));
    expect(readingsStraight[0]!.rangeM).not.toBeCloseTo(readingsRotated[0]!.rangeM, 3);
  });

  it("차체 자기 몸체는 obstacles 목록에 없으므로 자기 자신에 막히지 않는다", () => {
    // 센서 mount(1.3,0)이 차체 내부에 있어도, obstacles에 자기 차체를 넣지 않으면 self-hit이 없다.
    const readings = computeSensorScan(ORIGIN, forwardSensor(), [], 0, createRng(0));
    expect(readings[0]!.rangeM).toBe(10);
  });

  it("noise_std_m>0이면 seed가 같을 때 항상 같은 잡음을 낸다(결정론적)", () => {
    const noisySensor = forwardSensor({ noiseStdM: 0.05 });
    const a = computeSensorScan(ORIGIN, noisySensor, [wall(6.5)], 0, createRng(7));
    const b = computeSensorScan(ORIGIN, noisySensor, [wall(6.5)], 0, createRng(7));
    expect(a).toEqual(b);
    const c = computeSensorScan(ORIGIN, noisySensor, [wall(6.5)], 0, createRng(8));
    expect(a[0]!.rangeM).not.toBe(c[0]!.rangeM);
  });

  it("다중 ray(reverse-bay fixture와 동일한 36-ray 배치)는 rayCount만큼 결과를 낸다", () => {
    const sensor = forwardSensor({
      rayCount: 36,
      angleMinRad: -Math.PI,
      angleIncrementRad: (2 * Math.PI) / 36,
    });
    const readings = computeSensorScan(ORIGIN, sensor, [wall(6.5)], 0, createRng(0));
    expect(readings).toHaveLength(36);
    // ray index 18의 각도는 angleMin(-pi) + 18*inc(pi/18) = 0 → 정면.
    expect(readings[18]!.angleRad).toBeCloseTo(0, 9);
    expect(readings[18]!.rangeM).toBeCloseTo(5.1, 6);
  });
});
