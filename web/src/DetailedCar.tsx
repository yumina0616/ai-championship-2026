import { Component, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, Vector3, type Object3D } from "three";
import { carTransform } from "./driving";
import { sampleMotion, type MotionFrame } from "./motion";
import { MrParkRobot } from "./DesignObjects";
import { boardingPose } from "./BoardingRobot";

// CC BY 4.0 Car Concept. 출처/변경 사항은 public/models/NOTICE.md와 credits.html 참조.
export const CAR_ASSET_URL = "/models/car-concept.glb";

export type VehicleAssetState = "loading" | "detailed" | "fallback" | "low";

// 로딩 중에는 다른 차를 표시하지 않는다. 실패가 확정된 경우에만 경량 차를 사용한다.
export function AssetFallback({ onReady, children }: { onReady: (state: VehicleAssetState) => void; children: ReactNode }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.domElement.dataset.vehicleAsset = "fallback";
    onReady("fallback");
    return () => { delete gl.domElement.dataset.vehicleAsset; };
  }, [gl, onReady]);
  return children;
}

export class CarAssetBoundary extends Component<{children: ReactNode; fallback: ReactNode}, {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function DetailedCar({ position, rotation, motion, brake, reverse, boardingAt = null, mascotDriver = false, onReady }: {
  position: [number, number, number]; rotation: number;
  motion: RefObject<MotionFrame>; brake: boolean; reverse: boolean;
  boardingAt?: number | null; mascotDriver?: boolean;
  onReady?: (state: VehicleAssetState) => void;
}) {
  const { scene } = useGLTF(CAR_ASSET_URL);
  const body = useRef<Group>(null);
  const passenger = useRef<Group>(null);
  const { invalidate, gl } = useThree();
  const model = useMemo(() => {
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene, true);
    const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    const widthScale = 1.8 / size.x;
    const root = new Group();
    const door = new Group();
    // 표시용 오른쪽 앞문 힌지. 차체 충돌 외곽과 엔진 상태는 바꾸지 않는다.
    door.position.set(-.82, .6, .8); root.add(door);
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const wheels = new Map<string, { yaw: Group; spin: Group; center: Vector3 }>();
    const originalFront = new Vector3(), originalRear = new Vector3();
    scene.getObjectByName("WheelFrontL")!.getWorldPosition(originalFront);
    scene.getObjectByName("WheelRearL")!.getWorldPosition(originalRear);
    const zScale = 2.6 / (originalFront.z - originalRear.z);
    // 차축/범퍼를 각각 기존 2.6m / 4.4m 계약에 맞추는 표시 전용 좌표 변환.
    const mapZ = (z: number) => z < originalRear.z
      ? -1.3 + (z - originalRear.z) * .9 / (originalRear.z - bounds.min.z)
      : z > originalFront.z
        ? 1.3 + (z - originalFront.z) * .9 / (bounds.max.z - originalFront.z)
        : -1.3 + (z - originalRear.z) * zScale;
    const brakeMaterials: MeshStandardMaterial[] = [];
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      // 원본 상표는 서비스의 배지/차량번호로 사용하지 않는다.
      if (/License|Emblem/i.test(node.name)) return;
      let ancestor: Object3D | null = node;
      while (ancestor && !/^Wheel(Front|Rear)[LR]$/.test(ancestor.name)) ancestor = ancestor.parent;
      const wheelName = ancestor?.name;
      let doorAncestor: Object3D | null = node;
      while (doorAncestor && doorAncestor.name !== "BodyDoorRColor1") doorAncestor = doorAncestor.parent;
      if (ancestor && !wheels.has(ancestor.name)) {
        const at = ancestor.getWorldPosition(new Vector3());
        const yaw = new Group(), spin = new Group();
        yaw.name = ancestor.name;
        yaw.position.set((at.x - center.x) * widthScale, (at.y - bounds.min.y) * zScale, ancestor.name.includes("Front") ? 1.3 : -1.3);
        yaw.add(spin); root.add(yaw);
        wheels.set(ancestor.name, { yaw, spin, center: at });
      }
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      const points = geometry.getAttribute("position");
      const p = new Vector3();
      const wheel = wheelName ? wheels.get(wheelName) : undefined;
      if (wheel) {
        geometry.translate(-wheel.center.x, -wheel.center.y, -wheel.center.z);
        // 원본 샘플의 앞바퀴 30도 촬영 포즈를 먼저 해제한다.
        if (wheelName!.includes("Front")) geometry.rotateY(Math.PI / 6);
        geometry.scale(widthScale, zScale, zScale);
      } else {
        for (let i = 0; i < points.count; i++) {
          p.fromBufferAttribute(points, i);
          points.setXYZ(i, (p.x - center.x) * widthScale, (p.y - bounds.min.y) * zScale, mapZ(p.z));
        }
        geometry.computeVertexNormals();
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (doorAncestor) geometry.translate(-door.position.x, -door.position.y, -door.position.z);
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      const mapped = sourceMaterials.map((original: MeshStandardMaterial) => {
        const cached = materials.get(original);
        if (cached) return cached;
        const material = original.clone();
        if (material.name.startsWith("Paint")) {
          material.color.set(material.name.includes("Paint 2") ? "#505a5c" : "#c6ccca");
          material.metalness = .82; material.roughness = .25;
          material.normalScale.set(.1, .1);
          if (material instanceof MeshPhysicalMaterial) material.iridescence = 0;
        }
        if (material.name.startsWith("Interior 3")) material.color.set("#7d786b");
        if (material.name.startsWith("Rim")) {
          material.map = null; material.emissiveMap = null;
          material.color.set("#a6afad"); material.metalness = .85; material.roughness = .23;
          material.emissive.set("#000000");
        }
        if (material.name === "Hardware") { material.map = null; material.emissiveMap = null; material.color.set("#8c9694"); material.emissive.set("#000000"); }
        if (material.name === "Glass" && material instanceof MeshPhysicalMaterial) {
          // 굴절용 추가 렌더 패스 없이 내부가 보이는 얇은 자동차 유리.
          material.transmission = 0; material.transparent = true; material.opacity = .63;
          material.depthWrite = false; material.color.set("#647678"); material.roughness = .14;
        }
        if (material.name === "Brakelight") brakeMaterials.push(material);
        materials.set(original, material);
        return material;
      });
      const mesh = new Mesh(geometry, Array.isArray(node.material) ? mapped : mapped[0]);
      mesh.name = node.name; mesh.castShadow = true; mesh.receiveShadow = true;
      (wheel?.spin ?? (doorAncestor ? door : root)).add(mesh);
    });
    return { root, wheels, materials, brakeMaterials, door };
  }, [scene]);
  useEffect(() => {
    gl.domElement.dataset.vehicleAsset = "detailed";
    onReady?.("detailed");
  }, [gl, onReady]);
  useEffect(() => {
    return () => {
      delete gl.domElement.dataset.vehicleAsset;
      model.root.traverse(n => { if (n instanceof Mesh) n.geometry.dispose(); });
      model.materials.forEach(m => m.dispose());
    };
  }, [model, gl]);
  useEffect(() => {
    model.brakeMaterials.forEach(m => { m.emissiveIntensity = brake ? 4 : .6; });
    invalidate();
  }, [brake, model, invalidate]);
  const previousTime = useRef<number | null>(null), spin = useRef(0);
  useFrame(() => {
    const elapsed = boardingAt === null ? 5 : (performance.now() - boardingAt) / 1000;
    model.door.rotation.y = boardingAt === null ? 0 : boardingPose(elapsed).door;
    if (passenger.current) passenger.current.visible = mascotDriver && elapsed >= 3.4;
    if (boardingAt !== null && elapsed < 4.2) invalidate();
    const visual = sampleMotion(motion.current, performance.now());
    if (!visual || !body.current) return;
    const transform = carTransform(visual.pose);
    body.current.position.fromArray(transform.position);
    body.current.rotation.y = transform.rotation;
    const dt = visual.time - (previousTime.current ?? visual.time);
    if (dt > 0 && dt < .2) spin.current += visual.speed * dt / .34;
    if (dt < 0) spin.current = 0;
    previousTime.current = visual.time;
    model.wheels.forEach((wheel, name) => {
      wheel.yaw.rotation.y = name.includes("Front") ? visual.steering : 0;
      wheel.spin.rotation.x = spin.current;
    });
    if (motion.current.running) invalidate();
  });
  return <group ref={body} position={position} rotation={[0, rotation, 0]} name="mrpark-detailed-car">
    <primitive object={model.root} dispose={null} />
    <group ref={passenger} visible={false}><MrParkRobot position={[-.36, .33, -.2]} scale={.49} animate={false} seated /></group>
    {[-.52, .52].map(x => <mesh key={x} position={[x, .36, -2.12]}>
      <boxGeometry args={[.17, .035, .03]} />
      <meshStandardMaterial color={reverse ? "#ffffff" : "#67716b"} emissive="#fff9e0" emissiveIntensity={reverse ? 2 : 0} />
    </mesh>)}
  </group>;
}
