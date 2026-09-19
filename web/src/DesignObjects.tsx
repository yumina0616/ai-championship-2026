import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, Group, Shape } from "three";

// 자체 제작 표현용 모델. +Z가 차량 전방이며 물리/센서 footprint를 변경하지 않는다.
type Section = readonly [z: number, halfWidth: number, bottom: number, top: number];
export const BODY_SECTIONS: readonly Section[] = [
  [-2.2, .61, .39, .67], [-2.06, .81, .29, .85],
  [-1.65, .88, .29, .91], [-1.1, .9, .3, .94],
  [0, .89, .3, .94], [.9, .9, .3, .9],
  [1.55, .86, .3, .81], [2.05, .79, .34, .74], [2.2, .74, .39, .72],
];
const GLASS_SECTIONS: readonly Section[] = [
  [-1.71, .64, .85, .9], [-1.05, .72, .9, 1.43],
  [-.65, .7, .91, 1.5], [.1, .69, .9, 1.48],
  [.48, .71, .89, 1.37], [1.12, .73, .87, .92],
];

// 둥근 닫힌 단면을 연결해 차체를 만든다. 원본 차량/상용 에셋을 복제하지 않는다.
export function coachworkGeometry(sections: readonly Section[], exponent = .45) {
  const vertices: number[] = [], indices: number[] = [];
  const segments = 32;
  for (const [z, width, bottom, top] of sections) {
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      vertices.push(width * Math.sign(c) * Math.abs(c) ** exponent,
        (top + bottom) / 2 + (top - bottom) / 2 * Math.sign(s) * Math.abs(s) ** exponent, z);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j, b = i * segments + (j + 1) % segments;
      indices.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }
  for (const end of [0, sections.length - 1]) {
    const [z, , bottom, top] = sections[end];
    const center = vertices.length / 3;
    vertices.push(0, (bottom + top) / 2, z);
    for (let j = 0; j < segments; j++) {
      const a = end * segments + j, b = end * segments + (j + 1) % segments;
      indices.push(...(end === 0 ? [center, b, a] : [center, a, b]));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export const Coachwork = memo(function Coachwork({ color }: { color: string }) {
  const body = useMemo(() => coachworkGeometry(BODY_SECTIONS), []);
  const glass = useMemo(() => coachworkGeometry(GLASS_SECTIONS, .7), []);
  useEffect(() => () => { body.dispose(); glass.dispose(); }, [body, glass]);
  return <group name="mrpark-coachwork">
    <mesh geometry={body} castShadow receiveShadow>
      <meshPhysicalMaterial color={color} metalness={.78} roughness={.26} clearcoat={1} clearcoatRoughness={.16} />
    </mesh>
    <mesh geometry={glass} castShadow>
      <meshPhysicalMaterial color="#18242a" metalness={.28} roughness={.13} clearcoat={1} />
    </mesh>
    {[-1, 1].map(side => <group key={side}>
      <RoundedBox args={[.04, .035, 2.64]} radius={.012} position={[side * .747, .91, -.24]}>
        <meshStandardMaterial color="#bec6c9" metalness={.9} roughness={.22} />
      </RoundedBox>
      <RoundedBox args={[.035, .53, .075]} radius={.012} position={[side * .709, 1.17, -.26]}>
        <meshStandardMaterial color="#11191d" metalness={.5} roughness={.2} />
      </RoundedBox>
      <RoundedBox args={[.035, .045, 2.38]} radius={.016} position={[side * .893, .38, -.05]}>
        <meshStandardMaterial color="#2a3032" metalness={.6} roughness={.26} />
      </RoundedBox>
      {[-1.3, 1.3].map(z => <mesh key={z} position={[side * .856, .35, z]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[.357, .043, 8, 40]} />
        <meshStandardMaterial color="#192025" roughness={.8} />
      </mesh>)}
    </group>)}
    <RoundedBox args={[1.3, .12, .09]} position={[0, .48, 2.13]} radius={.04}>
      <meshStandardMaterial color="#141c21" roughness={.4} />
    </RoundedBox>
    <mesh position={[0, .691, 2.08]}>
      <boxGeometry args={[1.23, .018, .023]} />
      <meshStandardMaterial color="#f3f4e8" emissive="#f0f4ff" emissiveIntensity={1.3} />
    </mesh>
    <mesh position={[0, .77, -2.08]}>
      <boxGeometry args={[1.34, .022, .027]} />
      <meshStandardMaterial color="#7e2728" emissive="#a32022" emissiveIntensity={.5} />
    </mesh>
  </group>;
});

const tie = new Shape();
tie.moveTo(0, 0); tie.lineTo(.044, -.04); tie.lineTo(.06, -.22);
tie.lineTo(0, -.28); tie.lineTo(-.06, -.22); tie.lineTo(-.044, -.04); tie.closePath();

/** 실제 정책이 아닌 시각적 캐릭터. 고개/손/눈만 움직이며 운전 command를 만들지 않는다. */
export const MrParkRobot = memo(function MrParkRobot({
  position, rotation = 0, animate = true,
  walking = false, scale = .78, seated = false, greeting = true,
}: { position: [number, number, number]; rotation?: number; animate?: boolean; walking?: boolean; scale?: number; seated?: boolean; greeting?: boolean }) {
  const head = useRef<Group>(null), arm = useRef<Group>(null), eyes = useRef<Group>(null);
  const time = useRef(0);
  const feet = useRef<Group>(null), otherArm = useRef<Group>(null);
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [animate, invalidate]);
  useFrame((_, dt) => {
    if (!animate) {
      if (head.current) head.current.rotation.z = -.06;
      if (arm.current) arm.current.rotation.z = greeting ? -.7 : -.15;
      if (eyes.current) eyes.current.scale.y = 1;
      return;
    }
    time.current += Math.min(dt, .05);
    const t = time.current;
    if (head.current) head.current.rotation.z = -.06 + Math.sin(t * .8) * .045;
    if (arm.current) {
      const target = walking || seated || !greeting ? -.15 : -.9 + Math.sin(t * 3.5) * .18;
      arm.current.rotation.z += (target - arm.current.rotation.z) * (1 - Math.exp(-Math.min(dt, .05) * 12));
      arm.current.rotation.x = seated ? -1 : walking ? Math.sin(t * 11) * .4 : 0;
    }
    if (otherArm.current) otherArm.current.rotation.x = seated ? -1 : walking ? -Math.sin(t * 11) * .4 : 0;
    feet.current?.children.forEach((foot, i) => { foot.position.z = .035 + (walking ? Math.sin(t * 11 + i * Math.PI) * .15 : 0); foot.position.y = .13 + (walking ? Math.max(0, Math.cos(t * 11 + i * Math.PI)) * .08 : 0); });
    if (eyes.current) eyes.current.scale.y = t % 5.4 > 5.25 ? .12 : 1;
    invalidate();
  });
  const shell = <meshPhysicalMaterial color="#e9e6dc" roughness={.28} metalness={.18} clearcoat={.7} />;
  return <group name="mrpark-robot" position={position} rotation={[0, rotation, 0]} scale={scale}>
    <group ref={feet} visible={!seated}>{[-1, 1].map(side => <group key={side} position={[side * .18, .13, .035]}>
      <mesh scale={[.16, .13, .22]} castShadow><sphereGeometry args={[1, 24, 16]} />{shell}</mesh>
      <mesh position={[0, -.065, .01]} scale={[.154, .035, .206]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#30383b" roughness={.8} /></mesh>
    </group>)}</group>
    <mesh position={[0, .47, 0]} scale={[.3, .34, .235]} castShadow><sphereGeometry args={[1, 32, 24]} />{shell}</mesh>
    <mesh position={[0, .78, 0]}><cylinderGeometry args={[.09, .11, .1, 16]} /><meshStandardMaterial color="#3a4245" metalness={.6} roughness={.28} /></mesh>
    <group ref={head} position={[0, 1.06, 0]}>
      {[-1, 1].map(side => <group key={side} position={[side * .425, -.025, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh><cylinderGeometry args={[.11, .11, .07, 24]} /><meshStandardMaterial color="#758481" metalness={.9} roughness={.23} /></mesh>
        <mesh position={[0, side * .04, 0]}><torusGeometry args={[.07, .009, 8, 24]} /><meshStandardMaterial color="#a6e2d0" emissive="#80c6b4" emissiveIntensity={.6} /></mesh>
      </group>)}
      <RoundedBox args={[.85, .65, .59]} radius={.24} smoothness={5} castShadow>{shell}</RoundedBox>
      <RoundedBox args={[.735, .48, .115]} radius={.19} smoothness={5} position={[0, -.015, .269]}>
        <meshPhysicalMaterial color="#10191f" roughness={.14} metalness={.2} clearcoat={1} />
      </RoundedBox>
      <group ref={eyes} position={[0, .012, .334]}>
        {[-1, 1].map(side => <mesh key={side} position={[side * .164, 0, 0]} rotation={[0, 0, .05 * -side]}>
          <torusGeometry args={[.068, .014, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#bcf8ec" emissive="#81e3d6" emissiveIntensity={2} toneMapped={false} />
        </mesh>)}
      </group>
      <mesh position={[0, -.135, .332]} rotation={[0, 0, Math.PI]}><torusGeometry args={[.032, .006, 8, 18, Math.PI]} /><meshStandardMaterial color="#b6e9dc" emissive="#80bdae" emissiveIntensity={.5} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .239, -.10, .324]} scale={[.06, .011, .006]}>
        <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#d1bca3" emissive="#b39b79" emissiveIntensity={.25} />
      </mesh>)}
      <mesh position={[0, .347, .02]}><sphereGeometry args={[.058, 16, 12]} /><meshStandardMaterial color="#303d40" metalness={.7} roughness={.2} /></mesh>
      <mesh position={[0, .355, .062]}><sphereGeometry args={[.021, 12, 8]} /><meshStandardMaterial color="#a9e5de" emissive="#85d7cf" emissiveIntensity={1} /></mesh>
    </group>
    <mesh position={[-.025, .68, .236]} rotation={[-.14, 0, -.08]}>
      <extrudeGeometry args={[tie, { depth: .018, bevelEnabled: true, bevelSize: .008, bevelThickness: .005, bevelSegments: 2, steps: 1 }]} />
      <meshStandardMaterial color="#253034" roughness={.7} />
    </mesh>
    <group position={[.17, .6, .21]} rotation={[0, .2, 0]}>
      <mesh><cylinderGeometry args={[.061, .061, .025, 24]} /><meshStandardMaterial color="#8e9696" metalness={.8} roughness={.23} /></mesh>
      <RoundedBox args={[.013, .065, .014]} radius={.004} position={[-.015, 0, .025]}>{shell}</RoundedBox>
      <RoundedBox args={[.037, .035, .015]} radius={.009} position={[.003, .016, .026]}>{shell}</RoundedBox>
    </group>
    <group ref={arm} position={[-.29, .64, 0]} rotation={[0, 0, -.7]}>
      <mesh position={[-.06, -.13, 0]} rotation={[0, 0, -.35]} castShadow><capsuleGeometry args={[.085, .19, 4, 12]} />{shell}</mesh>
      <mesh position={[-.1, -.29, .025]} scale={[.11, .12, .08]} castShadow><sphereGeometry args={[1, 20, 12]} />{shell}</mesh>
    </group>
    <group ref={otherArm} position={[.3, .64, 0]} rotation={[0, 0, -.2]}>
      <mesh position={[.035, -.14, .02]} castShadow><capsuleGeometry args={[.083, .17, 4, 12]} />{shell}</mesh>
      <mesh position={[.04, -.26, .06]} scale={[.1, .11, .08]} castShadow><sphereGeometry args={[1, 20, 12]} />{shell}</mesh>
    </group>
  </group>;
});
