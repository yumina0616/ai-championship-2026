// 거리 센서(ray-box 교차) 계산. docs/contracts.md "센서별 pose·방향·range·갱신 시각·valid flag"
// 와 "물체 미검출과 센서 결측을 구분한다. 결측을 0m로 대체하지 않는다"를 그대로 구현한다.
import { nextGaussian } from "./rng.js";
import type { Pose, RangeReading, RectObstacle, SensorSpec } from "./types.js";

function rotate(x: number, y: number, yawRad: number): [number, number] {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return [x * cos - y * sin, x * sin + y * cos];
}

/** ray를 obstacle의 로컬(비회전) 프레임으로 옮겨 AABB slab test를 한다. 교차 거리(t>=0) 또는 null. */
function rayObstacleDistance(
  originXM: number,
  originYM: number,
  dirXM: number,
  dirYM: number,
  obstacle: RectObstacle
): number | null {
  const dx = originXM - obstacle.centerXM;
  const dy = originYM - obstacle.centerYM;
  const [localOx, localOy] = rotate(dx, dy, -obstacle.yawRad);
  const [localDx, localDy] = rotate(dirXM, dirYM, -obstacle.yawRad);

  const halfLength = obstacle.lengthM / 2;
  const halfWidth = obstacle.widthM / 2;

  let tMin = -Infinity;
  let tMax = Infinity;

  for (const [origin, dir, half] of [
    [localOx, localDx, halfLength],
    [localOy, localDy, halfWidth],
  ] as const) {
    if (Math.abs(dir) < 1e-12) {
      if (origin < -half || origin > half) return null;
      continue;
    }
    let t1 = (-half - origin) / dir;
    let t2 = (half - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (tMax < 0) return null; // 박스가 ray 시작점 뒤쪽에 있음
  return tMin >= 0 ? tMin : tMax; // origin이 박스 내부면 tMax(탈출점) — 우리 용례에선 거의 발생하지 않음
}

/**
 * 한 센서(다중 ray)를 pose 기준으로 계산한다. 자기 차체는 obstacles에 포함하지 않는 것을
 * 호출자가 보장해야 한다(차체 자기 충돌 제외 요구사항은 이렇게 만족한다).
 */
export function computeSensorScan(
  pose: Pose,
  sensor: SensorSpec,
  obstacles: RectObstacle[],
  simTimeS: number,
  rng: () => number
): RangeReading[] {
  const [mountXM, mountYM] = rotate(sensor.poseVehicle.xM, sensor.poseVehicle.yM, pose.yawRad);
  const originXM = pose.xM + mountXM;
  const originYM = pose.yM + mountYM;
  const mountYawRad = pose.yawRad + sensor.poseVehicle.yawRad;

  const readings: RangeReading[] = [];
  for (let i = 0; i < sensor.rayCount; i++) {
    const angleRad = sensor.angleMinRad + i * sensor.angleIncrementRad;
    const worldAngleRad = mountYawRad + angleRad;
    const dirXM = Math.cos(worldAngleRad);
    const dirYM = Math.sin(worldAngleRad);

    let nearest: number | null = null;
    for (const obstacle of obstacles) {
      const distance = rayObstacleDistance(originXM, originYM, dirXM, dirYM, obstacle);
      if (distance !== null && distance <= sensor.maxRangeM) {
        if (nearest === null || distance < nearest) nearest = distance;
      }
    }

    if (nearest === null) {
      // 미검출: range 내에 아무것도 없음. 0m로 대체하지 않고 max_range로 표시.
      readings.push({ angleRad, rangeM: sensor.maxRangeM, valid: true, updatedSimTimeS: simTimeS });
      continue;
    }

    const noisy =
      sensor.noiseStdM > 0 ? nearest + nextGaussian(rng) * sensor.noiseStdM : nearest;
    const clamped = Math.min(sensor.maxRangeM, Math.max(0, noisy));
    readings.push({ angleRad, rangeM: clamped, valid: true, updatedSimTimeS: simTimeS });
  }
  return readings;
}

// 알려진 한계: 이 구현은 valid:false(센서 결측/오류)를 실제로 발생시키는 조건이 없다.
// "미검출"(범위 밖, valid:true·range=maxRange)만 구현했고, 결함 주입(dropout 등)은 #7 범위 밖으로 남겨둔다.
// 타입은 미리 valid:false를 지원해 나중에 추가할 때 소비자 쪽 코드를 다시 바꾸지 않아도 되게 했다.
