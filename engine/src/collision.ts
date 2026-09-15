// 회전 직사각형(OBB) vs OBB 충돌 판정 (Separating Axis Theorem).
// docs/contracts.md: footprint는 뒷차축 기준 뒤로 rear_overhang, 앞으로 wheelbase+front_overhang.
import type { OrientedRect, Pose, RectObstacle, VehicleSpec, WorldBounds } from "./types.js";

export type { OrientedRect } from "./types.js";

type Vec2 = readonly [number, number];

export function vehicleFootprint(pose: Pose, vehicle: VehicleSpec): OrientedRect {
  const lengthM = vehicle.rearOverhangM + vehicle.wheelbaseM + vehicle.frontOverhangM;
  // 박스는 뒷차축 기준 x in [-rearOverhang, wheelbase+frontOverhang] 이므로 중심은 그 중간.
  const forwardOffsetM =
    (vehicle.wheelbaseM + vehicle.frontOverhangM - vehicle.rearOverhangM) / 2;
  const centerXM = pose.xM + forwardOffsetM * Math.cos(pose.yawRad);
  const centerYM = pose.yM + forwardOffsetM * Math.sin(pose.yawRad);
  return { centerXM, centerYM, lengthM, widthM: vehicle.widthM, yawRad: pose.yawRad };
}

function corners(rect: OrientedRect): Vec2[] {
  const halfLength = rect.lengthM / 2;
  const halfWidth = rect.widthM / 2;
  const cos = Math.cos(rect.yawRad);
  const sin = Math.sin(rect.yawRad);
  const local: Vec2[] = [
    [halfLength, halfWidth],
    [halfLength, -halfWidth],
    [-halfLength, -halfWidth],
    [-halfLength, halfWidth],
  ];
  return local.map(([lx, ly]) => [
    rect.centerXM + lx * cos - ly * sin,
    rect.centerYM + lx * sin + ly * cos,
  ]);
}

function axisFor(angleRad: number): Vec2 {
  return [Math.cos(angleRad), Math.sin(angleRad)];
}

function projectExtent(points: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of points) {
    const projection = x * axis[0] + y * axis[1];
    if (projection < min) min = projection;
    if (projection > max) max = projection;
  }
  return [min, max];
}

/** 두 회전 직사각형이 겹치는지. 변의 수직 법선 4개를 분리축으로 검사(SAT). */
export function obbOverlap(a: OrientedRect, b: OrientedRect): boolean {
  const cornersA = corners(a);
  const cornersB = corners(b);
  const axes: Vec2[] = [
    axisFor(a.yawRad),
    axisFor(a.yawRad + Math.PI / 2),
    axisFor(b.yawRad),
    axisFor(b.yawRad + Math.PI / 2),
  ];
  for (const axis of axes) {
    const [minA, maxA] = projectExtent(cornersA, axis);
    const [minB, maxB] = projectExtent(cornersB, axis);
    if (maxA < minB || maxB < minA) return false; // 분리축 발견 → 겹치지 않음
  }
  return true;
}

export function footprintCollides(
  pose: Pose,
  vehicle: VehicleSpec,
  obstacles: RectObstacle[]
): boolean {
  const footprint = vehicleFootprint(pose, vehicle);
  return obstacles.some((obstacle) =>
    obbOverlap(footprint, {
      centerXM: obstacle.centerXM,
      centerYM: obstacle.centerYM,
      lengthM: obstacle.lengthM,
      widthM: obstacle.widthM,
      yawRad: obstacle.yawRad,
    })
  );
}

function pointInRect(pointXM: number, pointYM: number, rect: OrientedRect): boolean {
  const dx = pointXM - rect.centerXM;
  const dy = pointYM - rect.centerYM;
  const cos = Math.cos(-rect.yawRad);
  const sin = Math.sin(-rect.yawRad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= rect.lengthM / 2 && Math.abs(localY) <= rect.widthM / 2;
}

/** inner의 네 꼭짓점이 모두 outer 안에 있는지(완전 포함). #9 성공 판정의 "차체가 목표 공간에 포함"에 쓴다. */
export function rectFullyInside(inner: OrientedRect, outer: OrientedRect): boolean {
  return corners(inner).every(([x, y]) => pointInRect(x, y, outer));
}

export function footprintOutOfBounds(
  pose: Pose,
  vehicle: VehicleSpec,
  bounds: WorldBounds
): boolean {
  const footprint = vehicleFootprint(pose, vehicle);
  return corners(footprint).some(
    ([x, y]) => x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY
  );
}

export function footprintFullyInsideGoal(
  pose: Pose,
  vehicle: VehicleSpec,
  goalSpace: OrientedRect
): boolean {
  return rectFullyInside(vehicleFootprint(pose, vehicle), goalSpace);
}
