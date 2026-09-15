// rear-axle 기준 kinematic bicycle model. docs/contracts.md의 좌표/부호 규칙을 그대로 따른다.
// docs/integration-spike.md의 ROS2/Gazebo spike에서 같은 수식을 실측 검증했다.
import type { Command, Pose, VehicleSpec } from "./types.js";

export const DEFAULT_MAX_ACCEL_MPS2 = 2.0;
export const DEFAULT_MAX_STEERING_RATE_RAD_S = 1.5;

export function integrateBicycleModel(
  pose: Pose,
  command: Command,
  wheelbaseM: number,
  dtS: number
): Pose {
  const speed = command.targetSpeedMps;
  const steer = command.targetSteeringRad;
  const xM = pose.xM + speed * Math.cos(pose.yawRad) * dtS;
  const yM = pose.yM + speed * Math.sin(pose.yawRad) * dtS;
  const yawRad = normalizeAngle(
    pose.yawRad + (speed / wheelbaseM) * Math.tan(steer) * dtS
  );
  return { xM, yM, yawRad };
}

/** [-pi, pi) 정규화. docs/contracts.md "단위와 좌표" 규칙. */
export function normalizeAngle(angleRad: number): number {
  const twoPi = 2 * Math.PI;
  let normalized = (angleRad + Math.PI) % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized - Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 절대값 한계(vehicle spec) + 변화율 한계(가속/조향속도)를 모두 적용한다.
 * requested/applied를 둘 다 Episode에 보존하는 것은 engine.ts 쪽 책임이다.
 */
export function clampCommand(
  requested: Command,
  previous: Command,
  vehicle: VehicleSpec,
  dtS: number
): Command {
  const maxAccel = vehicle.maxAccelerationMps2 ?? DEFAULT_MAX_ACCEL_MPS2;
  const maxSteerRate =
    vehicle.maxSteeringRateRadPerS ?? DEFAULT_MAX_STEERING_RATE_RAD_S;

  const speedAbsClamped = clamp(
    requested.targetSpeedMps,
    -vehicle.maxReverseSpeedMps,
    vehicle.maxForwardSpeedMps
  );
  const steerAbsClamped = clamp(
    requested.targetSteeringRad,
    -vehicle.maxSteeringRad,
    vehicle.maxSteeringRad
  );

  const maxSpeedDelta = maxAccel * dtS;
  const targetSpeedMps = clamp(
    speedAbsClamped,
    previous.targetSpeedMps - maxSpeedDelta,
    previous.targetSpeedMps + maxSpeedDelta
  );

  const maxSteerDelta = maxSteerRate * dtS;
  const targetSteeringRad = clamp(
    steerAbsClamped,
    previous.targetSteeringRad - maxSteerDelta,
    previous.targetSteeringRad + maxSteerDelta
  );

  return { targetSpeedMps, targetSteeringRad };
}
