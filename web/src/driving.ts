import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ParkingEngine,
  integrateBicycleModel,
  FIXED_DT_S,
  type Pose,
  type Scenario,
  type StepResult,
  type OrientedRect,
} from "../../engine/src/index";
import type { TemplateId } from "./preview";
import {
  driverCommand,
  canShift,
  keyInput,
  type Gear,
  type DriverInput,
} from "./driver-controls";
import type { MotionFrame } from "./motion";
import {
  appendStep,
  beginEpisode,
  finishEpisode,
  saveEpisode,
  type DrivingContext,
  type LocalEpisode,
} from "./episodes";

// 렌더링과 물리가 공유하는 프리셋. UI 좌표는 (x, 높이, -y), pose는 뒷차축 기준입니다.
export function makeScenario(template: TemplateId): Scenario {
  const parked = [-6, 6, ...(template === "open" ? [] : [-3, 3])].map((x) => ({
    id: "parked-" + x,
    centerXM: x,
    centerYM: 1.55,
    lengthM: 4.4,
    widthM: 1.8,
    yawRad: -Math.PI / 2,
  }));
  return {
    scenarioId: "parkside-" + template + "-v2",
    layoutGroup: template,
    seed: 42,
    vehicle: {
      wheelbaseM: 2.6,
      frontOverhangM: 0.9,
      rearOverhangM: 0.9,
      widthM: 1.8,
      maxForwardSpeedMps: 1.5,
      maxReverseSpeedMps: 1,
      maxSteeringRad: 0.55,
    },
    bounds: { minX: -8.2, maxX: 8.2, minY: -6.05, maxY: 4.35 },
    start: { xM: 0.2, yM: -3.7, yawRad: 0 },
    obstacles: [
      ...parked,
      ...(template === "pillar"
        ? [
            {
              id: "pillar",
              centerXM: 1.63,
              centerYM: -0.38,
              lengthM: 0.6,
              widthM: 0.6,
              yawRad: 0,
            },
          ]
        : []),
    ],
    timeoutSimS: 90,
    sensor: {
      id: "primary",
      poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
      rayCount: 36,
      angleMinRad: -Math.PI,
      angleIncrementRad: Math.PI / 18,
      maxRangeM: 10,
      periodS: 0.05,
      noiseStdM: 0,
    },
    goalPose: { xM: 0, yM: 2.9, yawRad: -Math.PI / 2 },
    goalSpace: {
      centerXM: 0,
      centerYM: 1.6,
      lengthM: 5.4,
      widthM: 2.8,
      yawRad: -Math.PI / 2,
    },
    successCriteria: {
      positionToleranceM: 0.6,
      yawToleranceRad: 0.0872665,
      stoppedSpeedMps: 0.05,
      holdTimeS: 1,
      requireFootprintInsideGoal: true,
      collisionTerminates: true,
    },
  };
}
// 목표 외곽선의 중심이 실제 판정 경계다. 별도 화면용 치수를 만들지 않는다.
export function goalOutline(space: OrientedRect): [number, number, number][] {
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sy]) => {
    const x = (sx * space.lengthM) / 2,
      y = (sy * space.widthM) / 2;
    return [
      space.centerXM + x * Math.cos(space.yawRad) - y * Math.sin(space.yawRad),
      0.18,
      -(
        space.centerYM +
        x * Math.sin(space.yawRad) +
        y * Math.cos(space.yawRad)
      ),
    ];
  });
}
export function carTransform(pose: Pose): {
  position: [number, number, number];
  rotation: number;
} {
  return {
    position: [
      pose.xM + 1.3 * Math.cos(pose.yawRad),
      0.18,
      -(pose.yM + 1.3 * Math.sin(pose.yawRad)),
    ],
    rotation: pose.yawRad + Math.PI / 2,
  };
}
// 동일 엔진의 적분 함수를 재사용한 조향 연장선입니다. 충돌/경로 가능성은 검사하지 않습니다.
export function reverseGuide(
  pose: Pose,
  steeringRad: number,
  scenario: Scenario,
) {
  let current = { ...pose };
  const rails: [number, number, number][][] = [[], []];
  for (let i = 0; i <= 32; i++) {
    [-1, 1].forEach((side, index) => {
      const x = -scenario.vehicle.rearOverhangM,
        y = (side * scenario.vehicle.widthM) / 2;
      rails[index].push([
        current.xM +
          x * Math.cos(current.yawRad) -
          y * Math.sin(current.yawRad),
        0.2,
        -(
          current.yM +
          x * Math.sin(current.yawRad) +
          y * Math.cos(current.yawRad)
        ),
      ]);
    });
    current = integrateBicycleModel(
      current,
      { targetSpeedMps: -1, targetSteeringRad: steeringRad },
      scenario.vehicle.wheelbaseM,
      0.1,
    );
  }
  return rails;
}
export function useDriving(template: TemplateId, customScenario?: Scenario) {
  const scenario = useMemo(
    () => customScenario ?? makeScenario(template),
    [template, customScenario],
  );
  const engine = useRef(new ParkingEngine());
  const recording = useRef<LocalEpisode | null>(null);
  const context = useRef<DrivingContext>({
    viewMode: "follow",
    assistanceFlags: ["parking-status", "sensor-clearance", "steering-return"],
  });
  const [lastEpisode, setLastEpisode] = useState<LocalEpisode | null>(null);
  const [storageError, setStorageError] = useState("");
  const persist = useCallback((episode: LocalEpisode) => {
    void saveEpisode(episode).catch(() =>
      setStorageError(
        "로컬 기록 저장에 실패했어요. 현재 기록은 파일로 내려받을 수 있어요.",
      ),
    );
  }, []);
  const finishRecording = useCallback(
    (reason: LocalEpisode["footer"]["terminationReason"]) => {
      if (!recording.current) return;
      const complete = finishEpisode(recording.current, reason);
      recording.current = null;
      setLastEpisode(complete);
      persist(complete);
    },
    [persist],
  );
  const inputs = useRef(new Map<string, DriverInput>());
  const motion = useRef<MotionFrame>({
    previous: null,
    current: null,
    atMs: 0,
    remainderS: 0,
    running: false,
  });
  const analogSteer = useRef<number | null>(null);
  const gearRef = useRef<Gear>("P");
  const previous = useRef({ targetSpeedMps: 0, targetSteeringRad: 0 });
  const lastDriveGear = useRef<Gear | null>(null);
  const [gear, setGear] = useState<Gear>("P");
  const [held, setHeld] = useState<DriverInput[]>([]);
  const [shifts, setShifts] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<StepResult | null>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const clearInputs = useCallback(() => {
    inputs.current.clear();
    analogSteer.current = null;
    setHeld([]);
  }, []);
  const reset = useCallback(() => {
    finishRecording("user_abort");
    clearInputs();
    setActive(false);
    setPaused(false);
    setFailure(null);
    gearRef.current = "P";
    setGear("P");
    setShifts(0);
    lastDriveGear.current = null;
    setMessage("");
    previous.current = { targetSpeedMps: 0, targetSteeringRad: 0 };
    try {
      const observation = engine.current.reset(structuredClone(scenario));
      const initial: StepResult = {
        observation,
        poseTruth: { ...scenario.start },
        simTimeS: 0,
        appliedCommand: { ...previous.current },
        outcome: { terminated: false, reason: null },
      };
      motion.current = {
        previous: initial,
        current: initial,
        atMs: performance.now(),
        remainderS: 0,
        running: false,
      };
      setResult(initial);
      return true;
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "주차장 준비에 실패했어요.",
      );
      return false;
    }
  }, [scenario, clearInputs, finishRecording]);
  useEffect(() => {
    reset();
  }, [reset]);
  const pause = useCallback(() => {
    motion.current.running = false;
    clearInputs();
    setPaused(true);
  }, [clearInputs]);
  const stop = useCallback(
    (reason?: "engine_error") => {
      finishRecording(
        reason ?? motion.current.current?.outcome.reason ?? "user_abort",
      );
      motion.current.running = false;
      clearInputs();
      setActive(false);
    },
    [clearInputs, finishRecording],
  );
  const shift = useCallback(
    (next: Gear) => {
      const confirmingSuccess =
        next === "P" && motion.current.current?.outcome.reason === "success";
      if (!confirmingSuccess && !canShift(previous.current.targetSpeedMps)) {
        setMessage("먼저 브레이크로 완전히 정지한 뒤 기어를 바꿔주세요.");
        return false;
      }
      clearInputs();
      if (next !== "P") {
        if (lastDriveGear.current && lastDriveGear.current !== next)
          setShifts((n) => n + 1);
        lastDriveGear.current = next;
      }
      gearRef.current = next;
      setGear(next);
      setMessage(
        next === "P"
          ? "P · 주차 기어"
          : next === "D"
            ? "D · 액셀을 누르면 전진해요."
            : "R · 뒤쪽 공간을 확인하고 액셀을 눌러주세요.",
      );
      return true;
    },
    [clearInputs],
  );
  const press = useCallback(
    (input: DriverInput, source: string = input) => {
      if (!active || paused) return;
      if (inputs.current.has(source)) return;
      if (input === "throttle" && gearRef.current === "P")
        setMessage("P에서는 움직이지 않아요. D 또는 R을 선택해주세요.");
      inputs.current.set(source, input);
      setHeld([...new Set(inputs.current.values())]);
    },
    [active, paused],
  );
  const release = useCallback((input: DriverInput, source: string = input) => {
    if (!inputs.current.delete(source)) return;
    setHeld([...new Set(inputs.current.values())]);
  }, []);
  useEffect(() => {
    if (!active || paused) return;
    // 일시정지 중 최신 위치를 표시했으므로 재개 때 이전 tick으로 되돌아가지 않습니다.
    motion.current.previous = motion.current.current;
    motion.current.atMs = performance.now();
    motion.current.remainderS = 0;
    motion.current.running = true;
    const down = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,dialog"))
      )
        return;
      if (
        e.code === "Space" &&
        !(e.target instanceof HTMLElement && e.target.closest("button"))
      ) {
        e.preventDefault();
        pause();
      }
      const input = keyInput(e.code, gearRef.current);
      if (input) {
        e.preventDefault();
        if (!e.repeat) press(input, e.code);
      }
      const gears: Record<string, Gear> = { KeyE: "D", KeyQ: "R", KeyP: "P" };
      if (gears[e.code] && !e.repeat) {
        e.preventDefault();
        shift(gears[e.code]);
      }
    };
    const up = (e: KeyboardEvent) => {
      const input = keyInput(e.code, gearRef.current);
      if (input) release(input, e.code);
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);
    let frame = 0,
      lastTime = performance.now(),
      accumulator = 0;
    const loop = (now: number) => {
      accumulator += Math.min((now - lastTime) / 1000, 0.15);
      lastTime = now;
      let last: StepResult | null = null;
      try {
        while (accumulator >= FIXED_DT_S) {
          const command = driverCommand(
            gearRef.current,
            new Set(inputs.current.values()),
            previous.current,
            scenario.vehicle,
            FIXED_DT_S,
            analogSteer.current,
          );
          const before = motion.current.current!;
          last = engine.current.step(command);
          if (recording.current) {
            appendStep(recording.current, before, command, last, {
              ...context.current,
              gear: gearRef.current,
              inputs: [...new Set(inputs.current.values())],
              analogSteer: analogSteer.current,
            });
            if (
              recording.current.steps.length % 20 === 0 &&
              !last.outcome.terminated
            )
              persist(finishEpisode(recording.current, "incomplete"));
          }
          previous.current = last.appliedCommand;
          motion.current.previous = motion.current.current;
          motion.current.current = last;
          accumulator -= FIXED_DT_S;
          if (last.outcome.terminated) {
            setResult(last);
            stop();
            return;
          }
        }
        motion.current.atMs = now;
        motion.current.remainderS = accumulator;
        if (last) setResult(last);
      } catch (error) {
        setFailure(
          error instanceof Error ? error.message : "주행을 중단했어요.",
        );
        stop("engine_error");
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      motion.current.running = false;
      inputs.current.clear();
      analogSteer.current = null;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [active, paused, pause, stop, press, release, scenario, shift, persist]);
  return {
    context,
    lastEpisode,
    forgetEpisode: () => setLastEpisode(null),
    storageError,
    motion,
    parkingStatus: engine.current.getParkingStatus(),
    scenario,
    result,
    active,
    paused,
    failure,
    gear,
    held,
    shifts,
    message,
    shift,
    reset,
    pause,
    stop,
    press,
    release,
    steer: (value: number | null) => {
      analogSteer.current = active && !paused ? value : null;
    },
    start: () => {
      if (reset()) {
        setStorageError("");
        recording.current = beginEpisode(
          scenario,
          motion.current.current!,
          context.current,
        );
        persist(finishEpisode(recording.current, "incomplete"));
        setActive(true);
      }
    },
    resume: () => {
      clearInputs();
      setPaused(false);
    },
  };
}
