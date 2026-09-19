// #17: web/src/SensorAssist.tsx의 "gap"(경고음 트리거용) 계산을 그대로 재사용할 수 있도록
// 뽑아냈다 — emergencyBrake.ts도 같은 계산이 필요했는데, 처음엔 이 보정 없이 ray.rangeM을
// 그대로 썼다가 실패했다: 센서 장착점은 차량 뒷축에서 1.3m 앞인데, 앞범퍼는 뒷축에서 3.5m
// 앞까지 나가 있어서(wheelbase+frontOverhang), "정면 2m 남음"이라는 센서값이 실제로는 이미
// 범퍼가 박은 상태를 의미할 수 있었다(2.2m는 이미 차체 안쪽 거리). ray.rangeM은 "장착점부터"
// 거리이지 "차체 표면부터" 거리가 아니라는 걸 놓쳤던 것 — 반드시 차체 외곽까지의 거리를 먼저
// 빼야 실제 여유 거리(gap)가 나온다.
import type { RangeReading } from "../../engine/src/index.js";

export interface VehicleExtent {
  wheelbaseM: number;
  frontOverhangM: number;
  rearOverhangM: number;
  widthM: number;
}

/** ray가 센서 장착점에서 출발해 차체 자신의 외곽(단순 사각형 근사)을 빠져나오기까지의 거리. */
function vehicleExitDistanceM(
  angleRad: number,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleExtent
): number {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const exitX =
    Math.abs(dx) < 1e-9
      ? Infinity
      : ((dx > 0 ? vehicle.wheelbaseM + vehicle.frontOverhangM : -vehicle.rearOverhangM) - sensorPoseVehicle.xM) / dx;
  const exitY =
    Math.abs(dy) < 1e-9 ? Infinity : ((dy > 0 ? vehicle.widthM / 2 : -vehicle.widthM / 2) - sensorPoseVehicle.yM) / dy;
  return Math.max(0, Math.min(exitX, exitY));
}

/** 센서 원시값(장착점 기준)을 차체 표면 기준 실제 여유 거리로 바꾼다. 최근접 유클리드 거리는 아니다. */
export function sensorGapM(
  ray: Pick<RangeReading, "angleRad" | "rangeM">,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleExtent
): number {
  return Math.max(0, ray.rangeM - vehicleExitDistanceM(ray.angleRad, sensorPoseVehicle, vehicle));
}
