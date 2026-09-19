import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, RoundedBox } from "@react-three/drei";
import { Plane, Vector3 } from "three";
import { Car, SceneBoundary } from "./ParkingScene";
import type { OrientedRect } from "../../engine/src/index";

type Item = OrientedRect & { id: string; label: string };
export default function MapStudio({ items, selected, onSelect, onMove }: {
  items: Item[]; selected: string; onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const dragging = useRef<{ id: number; item: Item; x: number; z: number } | null>(null);
  const [held, setHeld] = useState(false);
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const point = new Vector3();
  const end = () => { dragging.current = null; setHeld(false); };
  useEffect(() => {
    const cancel = () => { dragging.current = null; setHeld(false); };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  function move(e: ThreeEvent<PointerEvent>) {
    const drag = dragging.current;
    if (!drag || drag.id !== e.pointerId || !e.ray.intersectPlane(ground, point)) return;
    e.stopPropagation();
    onMove(drag.item.id, Math.round((drag.item.centerXM + point.x - drag.x) * 10) / 10,
      Math.round((drag.item.centerYM - point.z + drag.z) * 10) / 10);
  }
  return <div className="map-studio" aria-label="3D 주차장 작업대">
    <div className="studio-caption"><span><i /> LIVE SPACE STUDIO</span><small>물체 드래그 · 빈 공간 회전 · 휠 확대</small></div>
    <SceneBoundary><Suspense fallback={<p>3D 작업대 준비 중… 평면 편집도 사용할 수 있어요.</p>}>
      <Canvas camera={{ position: [12, 15, 16], fov: 42 }} dpr={[1, 1.25]} frameloop="demand"
        onPointerMissed={end} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <color attach="background" args={["#15201e"]} />
        <ambientLight intensity={1.3} /><directionalLight position={[5, 15, 10]} intensity={3} />
        <hemisphereLight args={["#e5ecdf", "#344035", 1.2]} />
        <RoundedBox args={[17, .32, 11]} radius={.14} position={[0, -.2, -.75]}><meshStandardMaterial color="#3d5048" roughness={.7} /></RoundedBox>
        <gridHelper args={[18, 18, "#879e88", "#52685b"]} position={[0, -.025, -.75]} />
        {items.map(item => <group key={item.id} position={[item.centerXM, 0, -item.centerYM]} rotation={[0, item.yawRad, 0]}
          onPointerDown={e => {
            if (!e.ray.intersectPlane(ground, point)) return;
            e.stopPropagation(); onSelect(item.id); setHeld(true);
            dragging.current = { id: e.pointerId, item: { ...item }, x: point.x, z: point.z };
            (e.target as unknown as { setPointerCapture: (id: number) => void } | null)?.setPointerCapture(e.pointerId);
          }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {item.id === "goal" ? <mesh position={[0, .015, 0]}><boxGeometry args={[item.lengthM, .03, item.widthM]} /><meshStandardMaterial color="#8cae83" transparent opacity={.4} /></mesh>
            : item.id === "start" || item.id.startsWith("parked") ? <Car position={[0, 0, 0]} rotation={Math.PI / 2} color={item.id === "start" ? "#dde2cf" : "#6e8781"} />
              : <RoundedBox args={[item.lengthM, item.id.startsWith("pillar") ? 2.1 : .8, item.widthM]} radius={.03} position={[0, item.id.startsWith("pillar") ? 1.05 : .4, 0]}><meshStandardMaterial color="#b0ad91" roughness={.8} /></RoundedBox>}
          <Line points={[
            [-item.lengthM / 2, .05, -item.widthM / 2], [item.lengthM / 2, .05, -item.widthM / 2],
            [item.lengthM / 2, .05, item.widthM / 2], [-item.lengthM / 2, .05, item.widthM / 2], [-item.lengthM / 2, .05, -item.widthM / 2],
          ]} color={selected === item.id ? "#efffb4" : "#a7c9b0"} lineWidth={selected === item.id ? 3 : 1} />
        </group>)}
        <OrbitControls makeDefault target={[0, 0, -.75]} enabled={!held} minDistance={9} maxDistance={32} maxPolarAngle={Math.PI / 2.3} enablePan={false} />
      </Canvas>
    </Suspense></SceneBoundary>
    <span className="studio-scale">1 GRID = 1 M / VIEWPORT ONLY</span>
  </div>;
}
