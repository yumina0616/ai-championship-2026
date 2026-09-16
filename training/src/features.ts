// Observation <-> 신경망 입출력 벡터 변환. 지금 학습 fixture들이 전부 같은 차종/센서 배치를
// 쓰기 때문에 정규화 상수를 고정값으로 둔다 — 다른 차종/센서 개수를 지원하려면 이 부분부터
// scenario 기준으로 다시 계산해야 한다(MVP는 차종 1종만 지원한다는 product.md 범위와 일치).
import type { Command, Observation, VehicleSpec } from "../../engine/src/index.js";

export const EXPECTED_RAY_COUNT = 36;
export const FEATURE_SIZE = EXPECTED_RAY_COUNT + 2 + 3; // sensors + speed/steer + goal(x,y,yaw)
export const LABEL_SIZE = 2; // targetSpeedMps, targetSteeringRad (모두 [-1,1]로 정규화)

const MAX_RANGE_M = 10;
const GOAL_DISTANCE_SCALE_M = 10;

export function observationToFeatures(observation: Observation, vehicle: VehicleSpec): number[] {
  if (observation.sensors.length !== EXPECTED_RAY_COUNT) {
    throw new Error(
      `observationToFeatures: 이 모델은 ${EXPECTED_RAY_COUNT}-ray 센서 전용입니다(받은 값: ${observation.sensors.length}).`
    );
  }
  const sensorFeatures = observation.sensors.map((r) => (r.valid ? r.rangeM / MAX_RANGE_M : 1));
  return [
    ...sensorFeatures,
    observation.speedMps / vehicle.maxForwardSpeedMps,
    observation.steeringRad / vehicle.maxSteeringRad,
    observation.goalRelative.xM / GOAL_DISTANCE_SCALE_M,
    observation.goalRelative.yM / GOAL_DISTANCE_SCALE_M,
    observation.goalRelative.yawRad / Math.PI,
  ];
}

export function commandToLabel(command: Command, vehicle: VehicleSpec): number[] {
  const speedLimit = command.targetSpeedMps >= 0 ? vehicle.maxForwardSpeedMps : vehicle.maxReverseSpeedMps;
  return [command.targetSpeedMps / speedLimit, command.targetSteeringRad / vehicle.maxSteeringRad];
}

export function labelToCommand(label: readonly number[], vehicle: VehicleSpec): Command {
  const [speedNorm, steerNorm] = label;
  const speedLimit = (speedNorm ?? 0) >= 0 ? vehicle.maxForwardSpeedMps : vehicle.maxReverseSpeedMps;
  return {
    targetSpeedMps: (speedNorm ?? 0) * speedLimit,
    targetSteeringRad: (steerNorm ?? 0) * vehicle.maxSteeringRad,
  };
}
