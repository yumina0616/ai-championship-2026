import {
  FIXED_DT_S,
  normalizeAngle,
  type StepResult,
} from "../../engine/src/index";

// 표현 전용 두 tick 버퍼. 충돌/센서/평가에는 이 보간값을 전달하지 않습니다.
export type MotionFrame = {
  previous: StepResult | null;
  current: StepResult | null;
  atMs: number;
  remainderS: number;
  running: boolean;
  rate?: number;
};
export function sampleMotion(frame: MotionFrame, nowMs: number) {
  const b = frame.current;
  if (!b) return null;
  const a = frame.previous ?? b;
  const alpha =
    !frame.running || b.outcome.terminated
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            (frame.remainderS +
              (Math.max(0, nowMs - frame.atMs) / 1000) * (frame.rate ?? 1)) /
              FIXED_DT_S,
          ),
        );
  const blend = (x: number, y: number) =>
    alpha === 1 ? y : x + (y - x) * alpha;
  return {
    pose: {
      xM: blend(a.poseTruth.xM, b.poseTruth.xM),
      yM: blend(a.poseTruth.yM, b.poseTruth.yM),
      yawRad:
        alpha === 1
          ? b.poseTruth.yawRad
          : normalizeAngle(
              a.poseTruth.yawRad +
                normalizeAngle(b.poseTruth.yawRad - a.poseTruth.yawRad) * alpha,
            ),
    },
    steering: blend(a.observation.steeringRad, b.observation.steeringRad),
    speed: blend(a.observation.speedMps, b.observation.speedMps),
    time: blend(a.simTimeS, b.simTimeS),
  };
}
