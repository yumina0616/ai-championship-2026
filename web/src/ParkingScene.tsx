import {
  Component,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  RoundedBox,
  Line,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { Vector3, DataTexture, RGBAFormat, RepeatWrapping, PerspectiveCamera } from "three";
import { Coachwork, MrParkRobot } from "./DesignObjects";
import { AssetFallback, CarAssetBoundary, DetailedCar, type VehicleAssetState } from "./DetailedCar";
import CameraMonitor, { type MonitorMode } from "./CameraMonitor";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { TemplateId } from "./preview";
import type { Scenario } from "../../engine/src/index";
import {
  carTransform,
  makeScenario,
  reverseGuide,
  goalOutline,
} from "./driving";
import type { StepResult } from "../../engine/src/index";
import { storyCamera, FILM_SECONDS } from "./story";
import { sampleMotion, type MotionFrame } from "./motion";
import { buildOpening, OPENING_DURATION_S, openingShot } from "./opening";
import OpeningTelemetry from "./OpeningTelemetry";
import BoardingRobot from "./BoardingRobot";
import { boundaryCurbs } from "./scene-boundary";
import { FIXED_DT_S } from "../../engine/src/index";

export type CameraMode = "orbit" | "follow" | "top" | "rear" | "driver";
type Position = [number, number, number];
function Box({
  position,
  size,
  color,
  rounded = false,
}: {
  position: Position;
  size: Position;
  color: string;
  rounded?: boolean;
}) {
  return rounded ? (
    <RoundedBox
      args={size}
      radius={0.09}
      smoothness={2}
      position={position}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.65} />
    </RoundedBox>
  ) : (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
export const Car = memo(function Car({
  position,
  color = "#9ea6e0",
  rotation = 0,
  steering = 0,
  brake = false,
  reverse = false,
  time = 0,
  speed = 0,
  motion,
}: {
  position: Position;
  color?: string;
  rotation?: number;
  steering?: number;
  brake?: boolean;
  reverse?: boolean;
  time?: number;
  speed?: number;
  motion?: RefObject<MotionFrame>;
}) {
  const body = useRef<import("three").Group>(null);
  const axles = useRef<Array<import("three").Group | null>>([]);
  const invalidate = useThree((state) => state.invalidate);
  const spin = useRef(0),
    previousTime = useRef(time);
  const wheels = useRef<Array<import("three").Group | null>>([]);
  useFrame(() => {
    const visual = motion
      ? sampleMotion(motion.current, performance.now())
      : null;
    const renderTime = visual?.time ?? time;
    if (visual && body.current) {
      const transform = carTransform(visual.pose);
      body.current.position.fromArray(transform.position);
      body.current.rotation.y = transform.rotation;
      axles.current.forEach((axle) => {
        if (axle) axle.rotation.y = visual.steering;
      });
    }
    const dt = renderTime - previousTime.current;
    if (dt > 0 && dt < 0.2)
      spin.current += ((visual?.speed ?? speed) * dt) / 0.34;
    if (dt < 0) spin.current = 0;
    previousTime.current = renderTime;
    wheels.current.forEach((w) => {
      if (w) w.rotation.x = spin.current;
    });
    if (motion?.current.running) invalidate();
  });
  return (
    <group ref={body} position={position} rotation={[0, rotation, 0]}>
      <Coachwork color={color} />
      <Box
        position={[0, 0.3, 0]}
        size={[1.53, 0.13, 3.7]}
        color="#202c32"
        rounded
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            position={[side * 0.733, 1.14, -0.15]}
            size={[0.045, 0.64, 0.09]}
            color="#172a32"
          />
          <Box
            position={[side * 0.85, 0.99, 0.71]}
            size={[0.1, 0.13, 0.25]}
            color={color}
            rounded
          />
          {[-0.65, 0.55].map((z) => (
            <Box
              key={z}
              position={[side * 0.889, 0.84, z]}
              size={[0.018, 0.025, 0.21]}
              color="#d8e2db"
            />
          ))}
        </group>
      ))}
      {[-0.77, 0.77].flatMap((x, side) =>
        [-1.3, 1.3].map((z, axle) => (
          <group
            key={x + ":" + z}
            position={[x, 0.34, z]}
            rotation={[0, z > 0 ? steering : 0, 0]}
            ref={(el) => {
              if (z > 0) axles.current[side] = el;
            }}
          >
            <group
              ref={(el) => {
                wheels.current[side * 2 + axle] = el;
              }}
            >
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.34, 0.34, 0.24, 40]} />
                <meshStandardMaterial color="#172329" roughness={0.9} />
              </mesh>
              <mesh
                position={[x > 0 ? 0.127 : -0.127, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.255, 0.255, 0.015, 40]} />
                <meshStandardMaterial
                  color="#596369"
                  metalness={0.9}
                  roughness={0.2}
                />
              </mesh>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                <group key={i} rotation={[(i * Math.PI * 2) / 10, 0, 0]}>
                  <Box
                    position={[x > 0 ? 0.14 : -0.14, 0.11, 0]}
                    size={[0.018, 0.22, 0.028]}
                    color="#c5cbcb"
                  />
                </group>
              ))}
            </group>
          </group>
        )),
      )}
      <Box
        position={[0, 0.43, 2.15]}
        size={[1.42, 0.12, 0.055]}
        color="#172a32"
        rounded
      />
      <Box
        position={[0, 0.44, -2.16]}
        size={[1.42, 0.12, 0.055]}
        color="#172a32"
        rounded
      />
      {[-0.55, 0.55].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.68, 2.16]}>
            <boxGeometry args={[0.47, 0.055, 0.025]} />
            <meshStandardMaterial
              color="#faffdb"
              emissive="#f5ffd5"
              emissiveIntensity={0.6}
            />
          </mesh>
          <mesh position={[x, 0.7, -2.17]}>
            <boxGeometry args={[0.48, 0.055, 0.025]} />
            <meshStandardMaterial
              color={brake ? "#ff3046" : "#922b44"}
              emissive="#ff2044"
              emissiveIntensity={brake ? 2.4 : 0.25}
            />
          </mesh>
          <mesh position={[x, 0.57, -2.18]}>
            <boxGeometry args={[0.2, 0.04, 0.02]} />
            <meshStandardMaterial
              color={reverse ? "#fffde1" : "#647278"}
              emissive="#fffacb"
              emissiveIntensity={reverse ? 1.8 : 0}
            />
          </mesh>
        </group>
      ))}
      <Box
        position={[0, 0.54, -2.18]}
        size={[0.4, 0.12, 0.02]}
        color="#ecf3e4"
      />
    </group>
  );
});

function SiteLight({ position }: { position: Position }) {
  return (
    <group position={position}>
      <Box position={[0, 1.5, 0]} size={[0.16, 3, 0.25]} color="#454d53" />
      <mesh position={[0, 2.1, 0.14]}>
        <boxGeometry args={[0.07, 1.3, 0.02]} />
        <meshStandardMaterial
          color="#e1edee"
          emissive="#d0e4e6"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
}
function ParkingSign() {
  return (
    <group position={[8.6, 1.7, -4]} rotation={[0, -0.35, 0]}>
      <Box
        position={[0, 0, 0]}
        size={[1.6, 1.8, 0.35]}
        color="#1e262d"
        rounded
      />
      <Box
        position={[-0.32, 0, 0.19]}
        size={[0.15, 1.05, 0.04]}
        color="#dafa8b"
      />
      <Box
        position={[0, 0.45, 0.19]}
        size={[0.65, 0.15, 0.04]}
        color="#dafa8b"
      />
      <Box
        position={[0, 0.02, 0.19]}
        size={[0.65, 0.15, 0.04]}
        color="#dafa8b"
      />
      <Box
        position={[0.3, 0.23, 0.19]}
        size={[0.15, 0.55, 0.04]}
        color="#dafa8b"
      />
    </group>
  );
}
// 별도 엔진에서 검증한 기록만 표시하며 수동 운전 상태는 변경하지 않습니다.
function OpeningPlayback({
  frames,
  motion,
  paused,
  onDone,
  onShot,
}: {
  frames: StepResult[];
  motion: RefObject<MotionFrame>;
  paused: boolean;
  onDone: () => void;
  onShot: (shot: number) => void;
}) {
  const elapsed = useRef(0);
  const finished = useRef(false);
  const reported = useRef(-1);
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
  }, [paused, invalidate]);
  useFrame((_, dt) => {
    if (finished.current || paused) {
      motion.current.running = false;
      return;
    }
    if (!frames.length) {
      finished.current = true;
      onDone();
      return;
    }
    // 로딩/탭 복귀의 긴 첫 프레임을 재생 시간으로 소비하지 않는다.
    elapsed.current += Math.min(dt, 0.1);
    const rate = frames.at(-1)!.simTimeS / OPENING_DURATION_S;
    const time = elapsed.current * rate;
    const shot = openingShot(elapsed.current / OPENING_DURATION_S);
    if (shot !== reported.current) { reported.current = shot; onShot(shot); }
    const index = Math.min(frames.length - 1, Math.floor(time / FIXED_DT_S));
    motion.current = {
      previous: frames[Math.max(0, index - 1)],
      current: frames[index],
      atMs: performance.now(),
      remainderS: time % FIXED_DT_S,
      running: true,
      rate,
    };
    if (elapsed.current >= OPENING_DURATION_S) {
      motion.current.running = false;
      finished.current = true;
      onDone();
    } else invalidate();
  }, -1);
  return null;
}
function CameraRig({
  mode,
  result,
  reducedMotion,
  driving,
  onStoryProgress,
  motion,
  opening,
  introShot,
}: {
  mode: CameraMode;
  result: StepResult | null;
  reducedMotion: boolean;
  driving: boolean;
  onStoryProgress: (progress: number) => void;
  motion: RefObject<MotionFrame>;
  opening: boolean;
  introShot: number;
}) {
  const { camera, invalidate, size } = useThree();
  const controls = useRef<OrbitControlsType>(null);
  const target = useRef(new Vector3());
  const wanted = useRef(new Vector3());
  const moving = useRef(true);
  const filmTime = useRef(0);
  const reportedAt = useRef(-1);
  useEffect(() => {
    const narrow = size.width / size.height < 1.15;
    const fit = narrow ? (driving ? 1.2 : 1.55) : 1;
    wanted.current.copy(
      mode === "top"
        ? new Vector3(0, 29 * fit, 0.01)
        : driving
          ? new Vector3(18, 20, 23).multiplyScalar(fit)
          : new Vector3(10, 5.8, 13).multiplyScalar(fit),
    );
    target.current.set(
      driving ? 0 : narrow ? -1.5 : -4,
      !driving && narrow ? -3.5 : 0.5,
      1.5,
    );
    if (!driving) {
      const shot = storyCamera(filmTime.current / FILM_SECONDS, narrow);
      wanted.current.fromArray(shot.position);
      target.current.fromArray(shot.target);
    }
    moving.current = true;
    invalidate();
  }, [mode, driving, size.width, size.height, invalidate, reducedMotion]);
  useFrame((_, dt) => {
    const filmPlaying = !driving && !opening && !reducedMotion;
    if (filmPlaying) {
      filmTime.current += Math.min(dt, 0.1);
      const progress = (filmTime.current % FILM_SECONDS) / FILM_SECONDS;
      const shot = storyCamera(progress, size.width / size.height < 1.15);
      wanted.current.fromArray(shot.position);
      target.current.fromArray(shot.target);
      moving.current = true;
      if (filmTime.current - reportedAt.current >= 0.25) {
        onStoryProgress(progress);
        reportedAt.current = filmTime.current;
      }
    }
    if (opening && !reducedMotion) {
      const visual = sampleMotion(motion.current, performance.now());
      if (visual) {
        const center = carTransform(visual.pose).position;
        const fit = size.width / size.height < 1.15 ? 1.5 : 1;
        const drift = Math.sin(visual.time * .65) * .8;
        const shot = [[3.4 + drift, 1.25, 2.8], [-3.4, 3.2, 4.5 + drift], [.3 + drift, 13, 1], [5.5 + drift, 3.3, 7]][introShot];
        wanted.current.set(center[0] + shot[0] * fit, shot[1] * fit, center[2] + shot[2] * fit);
        target.current.set(center[0], .55, center[2]);
        moving.current = true;
      }
    } else if (mode === "driver") {
      const pose = sampleMotion(motion.current, performance.now())?.pose ?? result?.poseTruth;
      if (pose) {
        const center = carTransform(pose).position;
        wanted.current.set(center[0] + Math.cos(pose.yawRad) * .15 + Math.sin(pose.yawRad) * .3,
          1.04, center[2] - Math.sin(pose.yawRad) * .15 + Math.cos(pose.yawRad) * .3);
        target.current.set(center[0] + Math.cos(pose.yawRad) * 14, 1.04, center[2] - Math.sin(pose.yawRad) * 14);
        moving.current = true;
      }
    } else if (mode === "follow" || mode === "rear") {
      const pose = sampleMotion(motion.current, performance.now())?.pose ??
        result?.poseTruth ?? { xM: 0.2, yM: -3.7, yawRad: 0 };
      const center = carTransform(pose).position;
      const fit = size.width / size.height < 1 ? 1.2 : 1;
      wanted.current.set(
        center[0] -
          Math.cos(pose.yawRad) * (mode === "rear" ? -9 : 10) * fit +
          Math.sin(pose.yawRad) * 4,
        8 * fit,
        center[2] +
          Math.sin(pose.yawRad) * (mode === "rear" ? -9 : 10) * fit +
          Math.cos(pose.yawRad) * 4,
      );
      target.current.set(
        center[0] + Math.cos(pose.yawRad) * 1.5,
        0.2,
        center[2] - Math.sin(pose.yawRad) * 1.5,
      );
      moving.current = true;
    }
    if (!moving.current) return;
    const alpha = reducedMotion
      ? 1
      : 1 - Math.exp(-Math.min(dt, 0.1) * (opening ? 11 : mode === "driver" ? 12 : driving ? 2.4 : 5));
    camera.position.lerp(wanted.current, alpha);
    if (camera instanceof PerspectiveCamera) {
      const fov = mode === "driver" ? 65 : 40;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
    if (mode === "driver") {
      camera.lookAt(target.current);
    } else if (controls.current) {
      controls.current.target.lerp(target.current, alpha);
      controls.current.update();
    } else camera.lookAt(target.current);
    if (
      camera.position.distanceTo(wanted.current) < 0.005 &&
      (!controls.current ||
        controls.current.target.distanceTo(target.current) < 0.005)
    )
      moving.current = false;
    if (moving.current || filmPlaying) invalidate();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableRotate={driving && mode === "orbit"}
      enabled={driving && mode === "orbit"}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.4}
      enableDamping={false}
      onStart={() => {
        moving.current = false;
      }}
    />
  );
}
function World({
  template,
  customScenario,
  grid,
  result,
  sensors,
  driving,
  brake,
  reverse,
  motion,
  animated,
  opening,
  quality,
  boardingAt,
  mascotDriver,
  onAssetReady,
}: {
  template: TemplateId;
  customScenario?: Scenario;
  grid: boolean;
  result: StepResult | null;
  sensors: boolean;
  driving: boolean;
  brake: boolean;
  reverse: boolean;
  motion: RefObject<MotionFrame>;
  animated: boolean;
  opening: boolean;
  quality: "high" | "low";
  boardingAt: number | null;
  mascotDriver: boolean;
  onAssetReady: (state: VehicleAssetState) => void;
}) {
  const scenario = useMemo(
    () => customScenario ?? makeScenario(template),
    [template, customScenario],
  );
  const carOrigin = useMemo(() => carTransform(scenario.start), [scenario]);
  const asphalt = useMemo(() => {
    const data = new Uint8Array(128 * 128 * 4);
    let seed = 72;
    for (let i = 0; i < data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed >>> 29;
      data[i] = 83 + n;
      data[i + 1] = 85 + n;
      data[i + 2] = 85 + n;
      data[i + 3] = 255;
    }
    const texture = new DataTexture(data, 128, 128, RGBAFormat);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(9, 7);
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => asphalt.dispose(), [asphalt]);
  const scenery = useMemo(
    () => (
      <group position={[0, -0.3, 0]}>
        <mesh position={[0, 0.09, 0.85]} receiveShadow>
          <boxGeometry args={[160, 0.08, 160]} />
          <meshStandardMaterial
            map={asphalt}
            roughness={0.38}
            metalness={0.22}
          />
        </mesh>
        <group name="driving-area-boundary">
          {boundaryCurbs(scenario.bounds).map(curb => <group key={curb.id} name={`boundary-${curb.id}`}>
            <Box position={curb.position} size={curb.size} color="#747e84" />
            <Box position={[curb.position[0],.535,curb.position[2]]}
              size={[curb.size[0],.02,curb.size[2]]} color="#b7ad87" />
          </group>)}
        </group>
        {(customScenario ? [0] : [-6, -3, 0, 3, 6]).map((x, i) =>
          x === 0 ? (
            <group key={x} name="parking-goal">
              <mesh
                position={[
                  scenario.goalSpace.centerXM,
                  0.139,
                  -scenario.goalSpace.centerYM,
                ]}
                rotation={[0, scenario.goalSpace.yawRad, 0]}
              >
                <boxGeometry
                  args={[
                    scenario.goalSpace.lengthM,
                    0.015,
                    scenario.goalSpace.widthM,
                  ]}
                />
                <meshStandardMaterial color="#66756e" roughness={0.85} />
              </mesh>
              <Line
                points={goalOutline(scenario.goalSpace)}
                color="#d7eade"
                lineWidth={3}
              />
              <group
                position={[
                  scenario.goalSpace.centerXM,
                  0.18,
                  -scenario.goalSpace.centerYM,
                ]}
                rotation={[0, scenario.goalPose.yawRad, 0]}
              >
                <Line
                  points={[
                    [-0.55, 0, 0],
                    [0.55, 0, 0],
                    [0.25, 0, -0.25],
                  ]}
                  color="#b9d1c5"
                  lineWidth={2}
                />
                <Line
                  points={[
                    [0.55, 0, 0],
                    [0.25, 0, 0.25],
                  ]}
                  color="#b9d1c5"
                  lineWidth={2}
                />
              </group>
            </group>
          ) : (
            <group key={x}>
              <Box
                position={[x, 0.139, -1.7]}
                size={[2.77, 0.015, 4.48]}
                color={x === 0 ? "#66756e" : i % 2 ? "#535c65" : "#505961"}
              />
              {[-1.43, 1.43].map((offset) => (
                <Box
                  key={offset}
                  position={[x + offset, 0.16, -1.7]}
                  size={[0.075, 0.022, 4.5]}
                  color="#f4f4da"
                />
              ))}
              <Box
                position={[x, 0.16, -3.94]}
                size={[2.93, 0.025, 0.075]}
                color="#f4f4da"
              />
              <Box
                position={[x, 0.16, 2.08]}
                size={[1.35, 0.02, 0.08]}
                color="#e7e4dc"
              />
              <Box
                position={[x, 0.23, -3.7]}
                size={[1, 0.16, 0.16]}
                color="#e8c65d"
              />
            </group>
          ),
        )}
        {scenario.obstacles.map((o, i) =>
          !o.id.startsWith("parked") ? (
            <group
              key={o.id}
              position={[o.centerXM, 0, -o.centerYM]}
              rotation={[0, o.yawRad, 0]}
            >
              <Box
                position={[0, 1.2, 0]}
                size={[o.lengthM, 2.4, o.widthM]}
                color="#6a747b"
              />
              <Box
                position={[0, 0.6, 0]}
                size={[o.lengthM + 0.01, 0.4, o.widthM + 0.01]}
                color="#e9d16b"
              />
            </group>
          ) : (
            <Car
              key={o.id}
              position={[o.centerXM, 0.18, -o.centerYM]}
              rotation={o.yawRad + Math.PI / 2}
              color={["#41494d", "#8b9496", "#aea89b", "#384753"][i % 4]}
            />
          ),
        )}
        {[-6.7, -2.3, 2.3, 6.7].map((x) => (
          <SiteLight key={x} position={[x, 0.05, -5.85]} />
        ))}
        {[-8.95, 8.95].map((x) => (
          <group key={x} position={[x, 0, -3.2]}>
            <Box
              position={[0, 1.75, 0]}
              size={[0.08, 3.5, 0.08]}
              color="#677082"
            />
            <Box
              position={[0, 3.47, 0.32]}
              size={[0.32, 0.09, 0.8]}
              color="#494b69"
              rounded
            />
            <Box
              position={[0, 3.41, 0.32]}
              size={[0.25, 0.035, 0.6]}
              color="#fff4c5"
            />
          </group>
        ))}
        {/* 운전은 컷어웨이 뷰: 카메라를 가리는 촬영용 건축물만 숨긴다.
            위의 실제 장애물/차량과 엔진의 충돌·센서 계약은 변경하지 않는다. */}
        <group name="cinematic-architecture" visible={!driving}>
        {[-10, -15].map(z => <group key={z} position={[0, 0, z]}>
          {[-18, 18].map(x => <group key={x} position={[x, 0, 0]}>
            <Box position={[0, 4, 0]} size={[.5, 8, .55]} color="#2c3736" />
            <mesh position={[x < 0 ? .27 : -.27, 4, .15]}><boxGeometry args={[.04, 7.6, .08]} /><meshStandardMaterial color="#adfff0" emissive="#8bc9bb" emissiveIntensity={2.3} /></mesh>
          </group>)}
          <Box position={[0, 8, 0]} size={[36.5, .4, .55]} color="#303b39" />
          <mesh position={[0, 7.79, .15]}><boxGeometry args={[35.9, .035, .07]} /><meshStandardMaterial color="#d6f4e4" emissive="#bfefd9" emissiveIntensity={2.4} /></mesh>
        </group>)}
        {[-23, 23].map(x => <group key={x} position={[x, 0, 2]}>
          <Box position={[0, 3, 0]} size={[.6, 6, 30]} color="#3c4846" />
          {[-9, -3, 3, 9].map(z => <group key={z} position={[x < 0 ? .32 : -.32, 3, z]}>
            <Box position={[0, 0, 0]} size={[.03, 4.2, 4.8]} color="#95a4a0" />
            <Box position={[x < 0 ? .03 : -.03, 0, 0]} size={[.04, 4.2, .07]} color="#35423d" />
          </group>)}
        </group>)}
        {[-15, -9, -3, 3, 9, 15].map((x) => (
          <group key={x} position={[x, 0, -13]}>
            <Box position={[0, 3.5, 0]} size={[.75, 7, .85]} color="#555853" />
            <Box position={[0, 6.6, 2]} size={[.9, .5, 8]} color="#404440" />
            <mesh position={[0, 3.1, .436]}>
              <boxGeometry args={[.065, 3.6, .025]} />
              <meshStandardMaterial color="#f4e2bd" emissive="#f4d6a2" emissiveIntensity={3} />
            </mesh>
            <mesh position={[0, 6.32, 2]}>
              <boxGeometry args={[.08, .035, 7]} />
              <meshStandardMaterial color="#eee7d6" emissive="#eee7d6" emissiveIntensity={3} />
            </mesh>
          </group>
        ))}
        <Box position={[0, 3.3, -17]} size={[55, 6.6, .4]} color="#303634" />
        {[-12, 0, 12].map(x => <group key={x} position={[x, 0, -16.76]}>
          <Box position={[0, 2.8, 0]} size={[8, 3.6, .04]} color="#7c807a" />
          <mesh position={[0, 2.8, .03]}>
            <planeGeometry args={[7.7, 3.3]} />
            <meshBasicMaterial color="#b9c5c5" />
          </mesh>
          <Box position={[0, 2.8, .08]} size={[.09, 3.6, .05]} color="#333c39" />
        </group>)}
        <ParkingSign />
        </group>
        {grid && (
          <gridHelper
            args={[24, 24, "#8574b8", "#c9bfe2"]}
            position={[0, -1.28, 0]}
          />
        )}
        <mesh
          receiveShadow
          position={[0, -1.27, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial
            color="#222c35"
            roughness={0.55}
            metalness={0.15}
          />
        </mesh>
      </group>
    ),
    [scenario, asphalt, grid, driving],
  );
  return (
    <>
      {scenery}
      {boardingAt !== null && <BoardingRobot origin={carOrigin} began={boardingAt} animate={animated} />}
      {!driving && !opening && !customScenario && (
        <MrParkRobot position={[carOrigin.position[0] + 1.1, -.17, carOrigin.position[2] + 1.55]} rotation={.55} animate={animated} />
      )}
      <group position={[0, -0.3, 0]}>
        {quality === "high" ? (
          <CarAssetBoundary fallback={<AssetFallback onReady={onAssetReady}><Car {...carOrigin} motion={motion} color="#d0d4d2" brake={brake} reverse={reverse} /></AssetFallback>}>
            <Suspense fallback={null}>
              <DetailedCar {...carOrigin} motion={motion} brake={brake} reverse={reverse} boardingAt={boardingAt} mascotDriver={mascotDriver} onReady={onAssetReady} />
            </Suspense>
          </CarAssetBoundary>
        ) : <Car {...carOrigin} motion={motion} color="#d0d4d2" brake={brake} reverse={reverse} />}
        {driving &&
          reverse &&
          result &&
          reverseGuide(
            result.poseTruth,
            result.observation.steeringRad,
            scenario,
          ).map((rail, i) => (
            <Line
              key={i}
              points={rail}
              color="#f9e899"
              lineWidth={2}
              dashed
              dashSize={0.18}
              gapSize={0.12}
            />
          ))}
        {sensors &&
          result &&
          result.observation.sensors.map((r, i) => {
            if (!r.valid || !Number.isFinite(r.rangeM)) return null;
            const pose = result.poseTruth,
              s = scenario.sensor.poseVehicle;
            const ox =
              pose.xM +
              s.xM * Math.cos(pose.yawRad) -
              s.yM * Math.sin(pose.yawRad);
            const oy =
              pose.yM +
              s.xM * Math.sin(pose.yawRad) +
              s.yM * Math.cos(pose.yawRad);
            const a = pose.yawRad + s.yawRad + r.angleRad,
              hit = r.rangeM < scenario.sensor.maxRangeM;
            const point: Position = [
              ox + r.rangeM * Math.cos(a),
              0.22,
              -(oy + r.rangeM * Math.sin(a)),
            ];
            return (
              <group key={i}>
                <Line
                  points={[[ox, 0.22, -oy], point]}
                  color={hit ? "#92fff2" : "#bacddd"}
                  transparent
                  opacity={hit ? 0.7 : 0.13}
                  lineWidth={hit ? 1.5 : 0.6}
                />
                {hit && (
                  <mesh position={point}>
                    <sphereGeometry args={[0.06, 8, 6]} />
                    <meshBasicMaterial color="#bcfff5" />
                  </mesh>
                )}
              </group>
            );
          })}
      </group>
    </>
  );
}
function SceneUnavailable({ onUnavailable }: { onUnavailable?: () => void }) {
  useEffect(() => {
    onUnavailable?.();
  }, [onUnavailable]);
  return (
    <div className="scene-fallback">
      <strong>3D 화면을 열지 못했어요.</strong>
      <p>WebGL을 지원하는 브라우저에서 다시 열어주세요.</p>
    </div>
  );
}
export class SceneBoundary extends Component<
  { children: ReactNode; onUnavailable?: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <SceneUnavailable onUnavailable={this.props.onUnavailable} />
    ) : (
      this.props.children
    );
  }
}
export default function ParkingScene({
  template,
  customScenario,
  result,
  motion,
  cameraMode,
  sensors,
  grid,
  reducedMotion,
  driving = false,
  onStoryProgress,
  onUnavailable,
  brake = false,
  reverse = false,
  opening = false,
  onOpeningDone,
  quality = "high",
  monitor = null,
  boardingAt = null,
  mascotDriver = false,
  onIntroShot,
  onAssetState,
}: {
  template: TemplateId;
  customScenario?: Scenario;
  result: StepResult | null;
  motion: RefObject<MotionFrame>;
  cameraMode: CameraMode;
  sensors: boolean;
  grid: boolean;
  reducedMotion: boolean;
  driving?: boolean;
  onStoryProgress: (progress: number) => void;
  brake?: boolean;
  reverse?: boolean;
  onUnavailable?: () => void;
  opening?: boolean;
  onOpeningDone: () => void;
  quality?: "high" | "low";
  monitor?: MonitorMode | null;
  boardingAt?: number | null;
  mascotDriver?: boolean;
  onIntroShot?: (shot: number) => void;
  onAssetState?: (state: VehicleAssetState) => void;
}) {
  const [asset, setAsset] = useState<VehicleAssetState>("loading");
  const assetReady = quality === "low" || asset !== "loading";
  useEffect(() => { onAssetState?.(quality === "low" ? "low" : asset); }, [asset, quality, onAssetState]);
  const openingFrames = useMemo(() => buildOpening(), []);
  const [introShot, setIntroShot] = useState(0);
  useEffect(() => { onIntroShot?.(introShot); }, [introShot, onIntroShot]);
  const openingMotion = useRef<MotionFrame>({
    previous: openingFrames[0] ?? null,
    current: openingFrames[0] ?? null,
    atMs: 0,
    remainderS: 0,
    running: false,
  });
  const sceneMotion = opening ? openingMotion : motion;
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    if (host.current) observer.observe(host.current);
    // R3F 자식의 비동기 초기화 전에도 non-bubbling context loss를 감지한다.
    const node = host.current;
    const contextLost = (event: Event) => {
      event.preventDefault();
      setLost(true);
    };
    node?.addEventListener("webglcontextlost", contextLost, true);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      node?.removeEventListener("webglcontextlost", contextLost, true);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  // R3F의 비동기 renderer 초기화 전에 지원 여부를 확인합니다.
  const [supported] = useState(() => {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      if (!context) return false;
      context.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  });
  if (!supported || lost)
    return <SceneUnavailable onUnavailable={onUnavailable} />;
  return (
    <div ref={host} className="scene-canvas" data-quality={quality} data-view={driving ? "cutaway" : "cinematic"} data-asset-state={quality === "low" ? "low" : asset}>
      <SceneBoundary onUnavailable={onUnavailable}>
        <Suspense
          fallback={
            <div className="scene-fallback">주차장을 준비하고 있어요…</div>
          }
        >
          <Canvas
            shadows={quality === "high"}
            dpr={quality === "low" ? 0.75 : [1, 1.25]}
            frameloop="demand"
            camera={{ position: [18, 3.4, 20], fov: 40 }}
            fallback={<span>3D를 지원하는 브라우저에서 다시 열어주세요.</span>}
            gl={{ alpha: true }}
          >
            {opening && (
              <OpeningPlayback
                frames={openingFrames}
                motion={openingMotion}
                paused={!visible || reducedMotion || !assetReady}
                onDone={onOpeningDone}
                onShot={setIntroShot}
              />
            )}
            <color attach="background" args={["#252c2d"]} />
            {opening && <OpeningTelemetry motion={openingMotion} frames={openingFrames} />}
            <fog attach="fog" args={["#252c2d", 24, 75]} />
            <ambientLight intensity={0.35} />
            <Environment resolution={128} frames={1} environmentIntensity={1.4}>
              <Lightformer
                position={[0, 8, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[12, 2, 1]}
                intensity={4}
                color="#fff8e9"
              />
              <Lightformer
                position={[-8, 3, 0]}
                rotation={[0, Math.PI / 2, 0]}
                scale={[3, 8, 1]}
                intensity={2}
                color="#d3e0e4"
              />
              <Lightformer
                position={[5, 3, 5]}
                rotation={[0, -Math.PI / 4, 0]}
                scale={[4, 8, 1]}
                intensity={2}
                color="#fff5db"
              />
            </Environment>
            <hemisphereLight args={["#cdd9dd", "#44413a", 1]} />
            <directionalLight position={[10, 7, 14]} intensity={1.5} color="#e5edee" />
            <directionalLight
              position={[-6, 14, 8]}
              intensity={2.8}
              color="#fff0d7"
              castShadow
              shadow-mapSize={quality === "high" ? [2048, 2048] : [512, 512]}
              shadow-camera-left={-16}
              shadow-camera-right={16}
              shadow-camera-top={16}
              shadow-camera-bottom={-16}
              shadow-normalBias={0.03}
            />
            <World
              template={template}
              customScenario={customScenario}
              grid={grid}
              result={result}
              sensors={sensors && !opening}
              driving={driving}
              brake={brake}
              reverse={reverse || opening}
              motion={sceneMotion}
              animated={!reducedMotion && visible}
              opening={opening}
              quality={quality}
              boardingAt={boardingAt}
              mascotDriver={mascotDriver}
              onAssetReady={setAsset}
            />
            <CameraRig
              mode={cameraMode}
              result={result}
              reducedMotion={reducedMotion || !visible || !assetReady}
              driving={driving}
              onStoryProgress={onStoryProgress}
              motion={sceneMotion}
              opening={opening}
              introShot={introShot}
            />
            {driving && monitor && <CameraMonitor motion={sceneMotion} mode={monitor} />}
          </Canvas>
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
