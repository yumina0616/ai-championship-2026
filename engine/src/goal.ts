// 목표(goal)의 세계 좌표를 차량(뒷차축) 기준 상대 pose로 변환한다.
// docs/contracts.md: "목표의 차량 기준 상대 x/y/yaw" — 자기 위치 추정 가정(simulation_ground_truth) 명시.
import { normalizeAngle } from "./vehicle.js";
import type { Pose } from "./types.js";

export function computeGoalRelative(vehiclePose: Pose, goalPoseWorld: Pose): Pose {
  const dx = goalPoseWorld.xM - vehiclePose.xM;
  const dy = goalPoseWorld.yM - vehiclePose.yM;
  const cos = Math.cos(vehiclePose.yawRad);
  const sin = Math.sin(vehiclePose.yawRad);
  return {
    xM: dx * cos + dy * sin,
    yM: -dx * sin + dy * cos,
    yawRad: normalizeAngle(goalPoseWorld.yawRad - vehiclePose.yawRad),
  };
}
