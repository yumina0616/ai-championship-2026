import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group } from "three";
import { MrParkRobot } from "./DesignObjects";

const ease = (t: number) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };
export function boardingPose(seconds: number) {
  const walk = ease(seconds / 1.9), enter = ease((seconds - 2.3) / 1.1);
  return { x: -1.8 + enter * 1.4, y: .12 + enter * .3, z: 1.8 * (1 - walk),
    door: .85 * ease((seconds - 1.35) / .65) * (1 - ease((seconds - 3.35) / .65)),
    visible: seconds < 3.4 };
}

export default function BoardingRobot({ origin, began, animate }: {
  origin: { position: [number, number, number]; rotation: number }; began: number; animate: boolean;
}) {
  const robot = useRef<Group>(null);
  const { invalidate } = useThree();
  useFrame(() => {
    if (!robot.current) return;
    const t = (performance.now() - began) / 1000, pose = boardingPose(t);
    robot.current.position.set(pose.x, pose.y, pose.z);
    robot.current.rotation.y = t < 1.9 ? Math.PI : Math.PI / 2;
    robot.current.visible = pose.visible;
    if (animate && t < 4.2) invalidate();
  });
  return <group position={[origin.position[0], origin.position[1] - .3, origin.position[2]]} rotation={[0, origin.rotation, 0]}>
    <group ref={robot}><MrParkRobot position={[0, 0, 0]} animate={animate} walking scale={.65} /></group>
  </group>;
}
