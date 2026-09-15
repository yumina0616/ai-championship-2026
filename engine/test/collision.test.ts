import { describe, expect, it } from "vitest";
import {
  footprintCollides,
  footprintOutOfBounds,
  obbOverlap,
  vehicleFootprint,
  type OrientedRect,
} from "../src/collision.js";
import type { Pose, RectObstacle, VehicleSpec, WorldBounds } from "../src/types.js";

const VEHICLE: VehicleSpec = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};

const BOUNDS: WorldBounds = { minX: 0, maxX: 20, minY: 0, maxY: 14 };

function wall(centerXM: number, lengthM = 0.2, widthM = 4): RectObstacle {
  return { id: "wall", centerXM, centerYM: 0, lengthM, widthM, yawRad: 0 };
}

describe("vehicleFootprint", () => {
  it("뒷차축 기준 박스 중심을 올바르게 계산한다 (fixture 수치 기준)", () => {
    const pose: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const footprint = vehicleFootprint(pose, VEHICLE);
    // (wheelbase+front-rear)/2 = (2.6+0.9-0.9)/2 = 1.3, length = 0.9+2.6+0.9 = 4.4
    expect(footprint.centerXM).toBeCloseTo(1.3, 9);
    expect(footprint.centerYM).toBeCloseTo(0, 9);
    expect(footprint.lengthM).toBeCloseTo(4.4, 9);
  });
});

describe("obbOverlap", () => {
  it("완전히 떨어진 두 직사각형은 겹치지 않는다", () => {
    const a: OrientedRect = { centerXM: 0, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0 };
    const b: OrientedRect = { centerXM: 10, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0 };
    expect(obbOverlap(a, b)).toBe(false);
  });

  it("중심이 겹치면 겹친다고 판정한다", () => {
    const a: OrientedRect = { centerXM: 0, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0 };
    const b: OrientedRect = { centerXM: 0.5, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0 };
    expect(obbOverlap(a, b)).toBe(true);
  });

  it("축이 정렬되지 않은(회전된) 사각형끼리도 올바르게 겹침을 판정한다", () => {
    // 45도 회전한 정사각형의 꼭짓점이 옆 사각형 안으로 들어간 경우(축 정렬 AABB 체크로는 놓치기 쉬운 case).
    const a: OrientedRect = { centerXM: 0, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0 };
    const b: OrientedRect = {
      centerXM: 1.9,
      centerYM: 0,
      lengthM: 2,
      widthM: 2,
      yawRad: Math.PI / 4,
    };
    expect(obbOverlap(a, b)).toBe(true);
  });

  it("분리축 하나만 있어도 겹치지 않는다고 정확히 판정한다(오탐 없음)", () => {
    const a: OrientedRect = { centerXM: 0, centerYM: 0, lengthM: 2, widthM: 2, yawRad: 0.2 };
    const b: OrientedRect = { centerXM: 3, centerYM: 3, lengthM: 2, widthM: 2, yawRad: -0.3 };
    expect(obbOverlap(a, b)).toBe(false);
  });
});

describe("footprintCollides / footprintOutOfBounds", () => {
  it("차량이 벽에서 충분히 떨어져 있으면 충돌이 아니다", () => {
    const pose: Pose = { xM: 0, yM: 0, yawRad: 0 };
    expect(footprintCollides(pose, VEHICLE, [wall(6.5)])).toBe(false);
  });

  it("차량 앞부분이 벽 안으로 들어가면 충돌이다", () => {
    // footprint 앞면 = pose.x + centerOffset(1.3) + length/2(2.2) = pose.x + 3.5. wall 앞면 = 6.5-0.1=6.4.
    // pose.x=2.8 -> 앞면 6.3 (0.1m 여유, 충돌 전). pose.x=3.0 -> 앞면 6.5 (wall 내부, 충돌).
    const justBefore: Pose = { xM: 2.8, yM: 0, yawRad: 0 };
    const overlapping: Pose = { xM: 3.0, yM: 0, yawRad: 0 };
    expect(footprintCollides(justBefore, VEHICLE, [wall(6.5)])).toBe(false);
    expect(footprintCollides(overlapping, VEHICLE, [wall(6.5)])).toBe(true);
  });

  it("world bounds를 벗어나면 충돌로 취급한다", () => {
    const pose: Pose = { xM: 19.9, yM: 0, yawRad: 0 }; // footprint 앞면이 21.9까지 뻗어 bounds(20) 초과
    expect(footprintOutOfBounds(pose, VEHICLE, BOUNDS)).toBe(true);
  });

  it("충돌 검사 한계: 얇은 장애물도 차체 전체 footprint로 검사하므로 한 step에 건너뛰지 않는다", () => {
    // footprintCollides는 앞 범퍼 점이 아니라 차체 전체(길이 4.4m) 사각형으로 겹침을 본다.
    // 따라서 한 step에 장애물을 "건너뛰려면" 이동거리가 (차체 길이 + 장애물 두께) ≈ 4.42m를 넘어야 한다.
    // 최대속도(1.5mps) * dt(0.05s) = 0.075m이므로 이 구현에서는 실제 사양 범위 내에서 tunneling이 일어나지 않는다.
    const thinObstacle = wall(3.537, 0.02, 4); // footprint 앞면(pose.x=0 기준 3.5)보다 0.027m 앞, 두께는 2cm뿐
    expect(footprintCollides({ xM: 0, yM: 0, yawRad: 0 }, VEHICLE, [thinObstacle])).toBe(false);
    // pose.x가 0.027~3.547 범위(거의 3.5m 구간) 내내 충돌로 판정되어야 "건너뛰지 않음"이 증명된다 — 몇 지점만 표본 확인.
    for (const xM of [0.05, 1.0, 2.0, 3.0, 3.5]) {
      expect(footprintCollides({ xM, yM: 0, yawRad: 0 }, VEHICLE, [thinObstacle])).toBe(true);
    }
    // 한 step 최대 이동거리(0.075m)보다 이 "충돌 구간"이 훨씬 넓으므로, 어떤 discrete step도 이 구간을 건너뛸 수 없다.
  });
});
