import { describe, expect, it } from "vitest";
import { computeGoalRelative } from "../src/goal.js";
import type { Pose } from "../src/types.js";

describe("computeGoalRelative", () => {
  it("차량과 목표가 같은 pose면 상대좌표는 (0,0,0)이다", () => {
    const pose: Pose = { xM: 3, yM: 4, yawRad: 0.5 };
    const relative = computeGoalRelative(pose, pose);
    expect(relative.xM).toBeCloseTo(0, 9);
    expect(relative.yM).toBeCloseTo(0, 9);
    expect(relative.yawRad).toBeCloseTo(0, 9);
  });

  it("yaw=0일 때 상대좌표는 세계좌표 차이와 같다", () => {
    const pose: Pose = { xM: 0, yM: 0, yawRad: 0 };
    const goal: Pose = { xM: 5, yM: 2, yawRad: 0.3 };
    const relative = computeGoalRelative(pose, goal);
    expect(relative.xM).toBeCloseTo(5, 9);
    expect(relative.yM).toBeCloseTo(2, 9);
    expect(relative.yawRad).toBeCloseTo(0.3, 9);
  });

  it("차량이 90도(반시계) 돌아있으면 목표가 정면(+x)에 있어도 로컬 -y로 계산된다", () => {
    // 차량 로컬 +x=전방, +y=왼쪽. 차량이 세계 +x쪽(yaw=pi/2 만큼 왼쪽 회전)을 보고 있을 때
    // 세계 +x 방향의 목표는 차량 기준으로 "오른쪽"(로컬 -y)에 있어야 한다.
    const pose: Pose = { xM: 0, yM: 0, yawRad: Math.PI / 2 };
    const goal: Pose = { xM: 1, yM: 0, yawRad: 0 };
    const relative = computeGoalRelative(pose, goal);
    expect(relative.xM).toBeCloseTo(0, 9);
    expect(relative.yM).toBeCloseTo(-1, 9);
  });

  it("yaw 차이는 [-pi, pi)로 정규화된다", () => {
    const pose: Pose = { xM: 0, yM: 0, yawRad: -Math.PI + 0.1 };
    const goal: Pose = { xM: 0, yM: 0, yawRad: Math.PI - 0.1 };
    const relative = computeGoalRelative(pose, goal);
    // 두 각도 차이는 실제로는 -0.2(짧은 쪽)여야 한다.
    expect(relative.yawRad).toBeCloseTo(-0.2, 6);
  });
});
