// 제한된 기준 후진주차 제어기 (#9). 재사용할 기존 계획기/제어기가 없음을 #2에서 확인했으므로
// 직접 구현한다. Hybrid A* 같은 전역 경로탐색이 아니라 목표점을 향한 순수추종(pure pursuit)
// 피드백 제어이며, 항상 후진 기어로 목표에 접근한다. 최적 경로나 항상 성공을 보장하지 않는다
// — docs/development.md "구현 경계"의 "최적 경로 보장" 제외 범위에 해당.
//
// truth 접근: 이 제어기는 Observation(센서)이 아니라 poseTruth/goalPose를 직접 받는다.
// docs/contracts.md "truth 기반 기준 계획기는 허용하되 정책과 다른 정보 접근을 metadata에
// 표시한다" — rollout.ts가 Episode header에 metadata.plannerUsesTruth=true로 기록한다.
import { computeGoalRelative } from "./goal.js";
import type { Command, Pose, VehicleSpec } from "./types.js";

export interface BaselineControllerOptions {
  /** 도착 판정 거리(m). 이 안에 들어오면 정지 명령만 낸다. */
  arrivalDistanceM: number;
  /** 후진 속도를 남은 거리에 곱하는 비례 계수. */
  speedGain: number;
}

const DEFAULT_OPTIONS: BaselineControllerOptions = {
  arrivalDistanceM: 0.3,
  speedGain: 0.6,
};

/**
 * 항상 후진으로 목표 pose에 접근하는 순수추종 제어기.
 * 차량 로컬 좌표(+x 전방)에서 목표가 있는 방향으로, "후진 중 순수추종"이 되도록
 * 종방향 축을 뒤집은(dxRev = -dx) 좌표에 표준 pure pursuit 곡률 공식을 적용한다.
 */
export function baselineReverseParkController(
  poseTruth: Pose,
  goalPose: Pose,
  vehicle: VehicleSpec,
  options: Partial<BaselineControllerOptions> = {}
): Command {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const relative = computeGoalRelative(poseTruth, goalPose);
  const distanceM = Math.hypot(relative.xM, relative.yM);

  if (distanceM <= opts.arrivalDistanceM) {
    return { targetSpeedMps: 0, targetSteeringRad: 0 };
  }

  const dxRevM = -relative.xM; // 후진 진행 방향 기준으로 종축을 뒤집는다.
  const dyRevM = relative.yM;
  const lookaheadSqM2 = dxRevM * dxRevM + dyRevM * dyRevM;
  const curvature = lookaheadSqM2 > 1e-6 ? (2 * dyRevM) / lookaheadSqM2 : 0;
  const rawSteeringRad = Math.atan(vehicle.wheelbaseM * curvature);

  const targetSteeringRad = clampAbs(rawSteeringRad, vehicle.maxSteeringRad);
  const targetSpeedMps = -clampAbs(opts.speedGain * distanceM, vehicle.maxReverseSpeedMps);

  return { targetSpeedMps, targetSteeringRad };
}

function clampAbs(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}
