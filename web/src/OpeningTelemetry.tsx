import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import { Line } from "@react-three/drei";
import type { StepResult } from "../../engine/src/index";
import type { MotionFrame } from "./motion";
import { makeScenario } from "./driving";

/** 홍보 영상용 가짜 센서가 아닌, 기준 실행에서 기록한 관측값을 렌더한다. */
export default function OpeningTelemetry({ motion, frames }: { motion: RefObject<MotionFrame>; frames: StepResult[] }) {
  const root = useRef<Group>(null);
  const pulse = useRef<Mesh>(null), sweep = useRef<Mesh>(null);
  const geometry = useMemo(() => new BufferGeometry().setAttribute("position", new Float32BufferAttribute(new Float32Array(36 * 6), 3)), []);
  const scenario = useMemo(() => makeScenario("open"), []);
  const path = useMemo(() => frames.map(f => [f.poseTruth.xM, -.11, -f.poseTruth.yM] as [number, number, number]), [frames]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const frame = motion.current.current;
    if (!frame || !root.current) return;
    const progress = frame.simTimeS / (frames.at(-1)?.simTimeS || 1);
    root.current.visible = progress > .24 && progress < .78;
    if (pulse.current) {
      pulse.current.position.set(frame.poseTruth.xM, -.1, -frame.poseTruth.yM);
      pulse.current.scale.setScalar(1 + ((progress * 9) % 1) * 4);
    }
    if (sweep.current) {
      sweep.current.position.set(frame.poseTruth.xM, .6, -frame.poseTruth.yM);
      sweep.current.rotation.y = -frame.poseTruth.yawRad;
      sweep.current.scale.x = 1 + Math.sin(progress * 25) * .3;
    }
    const pose = frame.poseTruth, sensor = scenario.sensor.poseVehicle;
    const ox = pose.xM + sensor.xM * Math.cos(pose.yawRad) - sensor.yM * Math.sin(pose.yawRad);
    const oy = pose.yM + sensor.xM * Math.sin(pose.yawRad) + sensor.yM * Math.cos(pose.yawRad);
    const points = geometry.getAttribute("position");
    let n = 0;
    for (const ray of frame.observation.sensors.slice(0, 36)) {
      if (!ray.valid || !Number.isFinite(ray.rangeM)) continue;
      const a = pose.yawRad + sensor.yawRad + ray.angleRad;
      points.setXYZ(n++, ox, .12, -oy);
      points.setXYZ(n++, ox + Math.cos(a) * ray.rangeM, .12, -oy - Math.sin(a) * ray.rangeM);
    }
    geometry.setDrawRange(0, n); points.needsUpdate = true;
  });
  return <group ref={root}>
    {/* 원형 펄스와 광면은 장식 강조이며 센서 검출 결과가 아니다. */}
    <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.98, 1, 80]} /><meshBasicMaterial color="#b2ffe8" transparent opacity={.3} depthWrite={false} /></mesh>
    <mesh ref={sweep} rotation={[0, 0, 0]}><boxGeometry args={[.025, 1.7, 3.1]} /><meshBasicMaterial color="#c9ffe9" transparent opacity={.13} depthWrite={false} /></mesh>
    <lineSegments geometry={geometry} frustumCulled={false}><lineBasicMaterial color="#a7fff0" transparent opacity={.65} depthWrite={false} /></lineSegments>
    {path.length > 1 && <Line points={path} color="#f5ecb4" lineWidth={3} />}
  </group>;
}
