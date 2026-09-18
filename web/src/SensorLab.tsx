import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Car, SceneBoundary } from "./ParkingScene";
import { ParkingEngine } from "../../engine/src/index";
import { carTransform, makeScenario } from "./driving";
import { RevealText, SectionNumber } from "./MotionDesign";

const chapters = [
  { name: "차체", title: "공간을 차지하는 AI.", text: "4.4 × 1.8m 차체, 2.6m 휠베이스. 화면의 크기와 엔진의 충돌 외곽을 같은 기준으로 맞췄어요. 실차 동역학 전체를 재현하는 모델은 아니에요." },
  { name: "센서", title: "보이는 것만, 거리로.", text: "36개의 가상 광선이 장애물과 만나는 거리를 계산해요. 아래는 고정된 데모 환경에서 엔진이 실제 계산한 값이에요. 실제 LiDAR 하드웨어나 카메라 인식이 아니에요." },
  { name: "조향", title: "회전에는 이유가 있다.", text: "앞바퀴 조향과 휠베이스에 따라 움직이는 자전거 모델을 사용해요. 아래 슬라이더로 조향각의 표시를 살펴보세요. 여기에서는 주행·추론하지 않아요." },
];
export default function SensorLab() {
  const [part, setPart] = useState(0), [steering, setSteering] = useState(0), [visible, setVisible] = useState(false);
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "80px" });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const { scenario, observation, transform } = useMemo(() => {
    const scenario = makeScenario("open"), engine = new ParkingEngine();
    return { scenario, observation: engine.reset(scenario), transform: carTransform(scenario.start) };
  }, []);
  const sensor = scenario.sensor.poseVehicle, pose = scenario.start;
  const ox = pose.xM + sensor.xM * Math.cos(pose.yawRad) - sensor.yM * Math.sin(pose.yawRad);
  const oy = pose.yM + sensor.xM * Math.sin(pose.yawRad) + sensor.yM * Math.cos(pose.yawRad);
  return <section ref={host} className="sensor-lab" aria-label="차량 기술 살펴보기">
    <div className="lab-copy"><SectionNumber number="03" label="UNDER THE SURFACE" /><h2><RevealText>보이지 않던 감각을,<br /><em>눈앞에.</em></RevealText></h2>
      <div className="lab-tabs" aria-label="차량 구성 요소">{chapters.map((c, i) => <button key={c.name} aria-pressed={part === i} onClick={() => setPart(i)}><span>0{i + 1}</span>{c.name}</button>)}</div>
      <div key={part} className="lab-description"><h3>{chapters[part].title}</h3><p>{chapters[part].text}</p>
        {part === 1 && <div className="lab-reading"><strong>{Math.min(...observation.sensors.filter(r => r.valid).map(r => r.rangeM)).toFixed(2)} <small>m</small></strong><span>가상 센서 원점 기준 최소 거리<br />차체 여유 거리와 다릅니다</span></div>}
        {part === 2 && <label className="lab-steering">표시 조향각 <b>{steering}°</b><input aria-label="차체 설명 조향각" type="range" min="-30" max="30" value={steering} onChange={e => setSteering(Number(e.target.value))} /></label>}
      </div>
    </div>
    <div className="lab-viewport"><span className="lab-view-label">SIMULATION / {chapters[part].name} <i /></span>
      <div className="lab-render">{visible && <SceneBoundary><Suspense fallback={<span>3D 구성 요소 준비 중…</span>}><Canvas frameloop="demand" dpr={[1, 1.25]} camera={{ position: [9, 7, 11], fov: 40 }}>
        <color attach="background" args={["#14212c"]} /><ambientLight intensity={1.5} /><directionalLight position={[4, 8, 9]} intensity={3} />
        <Car {...transform} color="#c5d4ca" steering={part === 2 ? steering * Math.PI / 180 : 0} />
        <gridHelper args={[22, 11, "#59788c", "#223341"]} position={[0, -.05, 0]} />
        {part === 1 && <>
          {scenario.obstacles.map((o, i) => <mesh key={i} position={[o.centerXM, .45, -o.centerYM]} rotation={[0, o.yawRad, 0]}><boxGeometry args={[o.lengthM, .9, o.widthM]} /><meshStandardMaterial color="#71877b" wireframe /></mesh>)}
          {observation.sensors.filter(r => r.valid).map((r, i) => { const a = pose.yawRad + sensor.yawRad + r.angleRad; return <Line key={i} points={[[ox, .25, -oy], [ox + Math.cos(a) * r.rangeM, .25, -oy - Math.sin(a) * r.rangeM]]} color="#9af6db" transparent opacity={.55} lineWidth={1} />; })}
        </>}
        <OrbitControls makeDefault target={[transform.position[0], .55, transform.position[2]]} enablePan={false} enableZoom={false} minDistance={6} maxDistance={18} maxPolarAngle={Math.PI / 2.2} />
      </Canvas></Suspense></SceneBoundary>}</div>
      <small>가로로 드래그해 회전 · 스크롤은 페이지 이동 · 설명용 3D</small>
    </div>
  </section>;
}
