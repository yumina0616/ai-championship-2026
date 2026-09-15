import { test, expect } from "@playwright/test";
import { sampleMotion, type MotionFrame } from "../src/motion";
import { buildOpening } from "../src/opening";
import { FIXED_DT_S } from "../../engine/src/index";

test("오프닝은 기준 제어기의 실제 성공 기록이며 저속 물리 한계를 지킨다", () => {
  const frames = buildOpening();
  expect(frames.length).toBeGreaterThan(2);
  expect(frames.at(-1)!.outcome.reason).toBe("success");
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1],
      b = frames[i];
    expect(b.simTimeS - a.simTimeS).toBeCloseTo(FIXED_DT_S);
    expect(
      Math.hypot(
        b.poseTruth.xM - a.poseTruth.xM,
        b.poseTruth.yM - a.poseTruth.yM,
      ),
    ).toBeLessThanOrEqual(FIXED_DT_S + 1e-9);
    expect(b.observation.sensors).toHaveLength(36);
  }
});

test("표시 보간은 반 틱 위치를 연결하고 외삽/원본 변경을 하지 않는다", () => {
  const frames = buildOpening();
  const previous = frames[25],
    current = frames[26];
  const frame: MotionFrame = {
    previous,
    current,
    atMs: 1000,
    remainderS: 0,
    running: true,
  };
  const original = structuredClone(frame);
  expect(sampleMotion(frame, 1025)!.pose.yM).toBeCloseTo(
    (previous.poseTruth.yM + current.poseTruth.yM) / 2,
  );
  expect(sampleMotion(frame, 9000)!.pose.yM).toBe(current.poseTruth.yM);
  expect(frame).toEqual(original);
  expect(sampleMotion({ ...frame, running: false }, 1000)!.pose).toEqual(
    current.poseTruth,
  );
  expect(sampleMotion({ ...frame, previous: current }, 1000)!.pose).toEqual(
    current.poseTruth,
  );
  expect(
    sampleMotion({ ...frame, current: frames.at(-1)! }, 1000)!.pose,
  ).toEqual(frames.at(-1)!.poseTruth);
});

test("회전 보간은 ±π 경계에서 짧은 방향으로 연결한다", () => {
  const base = buildOpening()[0];
  const a = {
    ...base,
    poseTruth: { ...base.poseTruth, yawRad: Math.PI - 0.1 },
  };
  const b = {
    ...base,
    poseTruth: { ...base.poseTruth, yawRad: -Math.PI + 0.1 },
  };
  const visual = sampleMotion(
    { previous: a, current: b, atMs: 0, remainderS: 0, running: true },
    25,
  )!;
  expect(Math.abs(visual.pose.yawRad)).toBeCloseTo(Math.PI);
});
