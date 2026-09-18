import { useEffect, useMemo, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Vector3, WebGLRenderTarget, Scene, OrthographicCamera, Mesh, PlaneGeometry, MeshBasicMaterial } from "three";
import { carTransform } from "./driving";
import { sampleMotion, type MotionFrame } from "./motion";

export type MonitorMode = "rear" | "mirror";
// CSS 모니터 외곽과 동일한 영역. 한 WebGL context 안에서 두 번째 실제 카메라를 렌더한다.
export function monitorRect(width: number, height: number) {
  const w = Math.min(300, width * .38), h = Math.round(w * .47);
  const y = width <= 800 ? 242 : 130;
  return { x: Math.round(width <= 800 ? width - w - 12 : (width - w) / 2), y, width: Math.round(w), height: h,
    bottom: Math.max(0, height - y - h) };
}
export default function CameraMonitor({ motion, mode }: { motion: RefObject<MotionFrame>; mode: MonitorMode }) {
  const monitor = useMemo(() => new PerspectiveCamera(75, 2.13, .08, 80), []);
  const display = useMemo(() => {
    const target = new WebGLRenderTarget(300, 141), scene = new Scene();
    const geometry = new PlaneGeometry(2, 2);
    // 촬영한 화면의 UV만 반전한다. 투영 반전으로 차체 앞·뒷면 판정까지 뒤집지 않는다.
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const material = new MeshBasicMaterial({ map: target.texture, depthTest: false, depthWrite: false });
    scene.add(new Mesh(geometry, material));
    return { target, scene, geometry, material, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, []);
  const aim = useMemo(() => new Vector3(), []);
  const { gl, invalidate } = useThree();
  useEffect(() => { gl.domElement.dataset.monitor = mode; invalidate(); return () => { delete gl.domElement.dataset.monitor; }; }, [gl, mode, invalidate]);
  useEffect(() => () => { display.target.dispose(); display.geometry.dispose(); display.material.dispose(); }, [display]);
  useFrame(({ gl: renderer, scene, camera, size }) => {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
    renderer.render(scene, camera);
    const visual = sampleMotion(motion.current, performance.now());
    if (!visual) return;
    const center = carTransform(visual.pose).position;
    const yaw = visual.pose.yawRad;
    const forwardX = Math.cos(yaw), forwardZ = -Math.sin(yaw);
    const side = mode === "mirror" ? 1.02 : 0;
    // 후방은 범퍼 바로 뒤, 미러는 운전석 외측에서 차량 뒤를 본다.
    const longitudinal = mode === "mirror" ? .65 : -2.26;
    monitor.position.set(center[0] + forwardX * longitudinal + Math.sin(yaw) * side,
      mode === "mirror" ? 1.02 : .56,
      center[2] + forwardZ * longitudinal + Math.cos(yaw) * side);
    aim.set(monitor.position.x - forwardX * 9, -.08, monitor.position.z - forwardZ * 9);
    const rect = monitorRect(size.width, size.height);
    monitor.aspect = rect.width / rect.height;
    monitor.fov = mode === "mirror" ? 60 : 90;
    monitor.updateProjectionMatrix();
    monitor.lookAt(aim);
    // 먼저 올바른 면 판정으로 촬영하고, 미러 모드에서만 화면 텍스처를 좌우 반전한다.
    if (mode === "mirror") {
      display.target.setSize(rect.width, rect.height);
      renderer.setRenderTarget(display.target);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, rect.width, rect.height);
      renderer.render(scene, monitor);
      renderer.setRenderTarget(null);
    }
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, rect.bottom, rect.width, rect.height);
    renderer.setViewport(rect.x, rect.bottom, rect.width, rect.height);
    renderer.clear(true, true, false);
    if (mode === "mirror") renderer.render(display.scene, display.camera);
    else renderer.render(scene, monitor);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.width, size.height);
  }, 1);
  return null;
}
