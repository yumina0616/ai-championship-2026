import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ParkingEngine,
  integrateBicycleModel,
  FIXED_DT_S,
  type Pose,
  type Scenario,
  type StepResult,
} from "../../engine/src/index";
import type { TemplateId } from "./preview";
import {
  driverCommand,
  canShift,
  type Gear,
  type DriverInput,
} from "./driver-controls";

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
    scenarioId: "parkside-" + template + "-v1",
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
    goalPose: { xM: 0, yM: 2.95, yawRad: -Math.PI / 2 },
    goalSpace: {
      centerXM: 0,
      centerYM: 1.65,
      lengthM: 4.5,
      widthM: 2.8,
      yawRad: -Math.PI / 2,
    },
    successCriteria: {
      positionToleranceM: 0.25,
      yawToleranceRad: 0.0872665,
      stoppedSpeedMps: 0.05,
      holdTimeS: 1,
      requireFootprintInsideGoal: true,
      collisionTerminates: true,
    },
  };
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
export function useDriving(template: TemplateId) {
  const scenario = useMemo(() => makeScenario(template), [template]);
  const engine = useRef(new ParkingEngine());
  const inputs = useRef(new Set<DriverInput>());
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
      setResult({
        observation,
        poseTruth: { ...scenario.start },
        simTimeS: 0,
        appliedCommand: { ...previous.current },
        outcome: { terminated: false, reason: null },
      });
      return true;
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "주차장 준비에 실패했어요.",
      );
      return false;
    }
  }, [scenario, clearInputs]);
  useEffect(() => {
    reset();
  }, [reset]);
  const pause = useCallback(() => {
    clearInputs();
    setPaused(true);
  }, [clearInputs]);
  const stop = useCallback(() => {
    clearInputs();
    setActive(false);
  }, [clearInputs]);
  const shift = useCallback(
    (next: Gear) => {
      if (!canShift(previous.current.targetSpeedMps)) {
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
    (input: DriverInput) => {
      if (!active || paused) return;
      if (input === "throttle" && gearRef.current === "P")
        setMessage("P에서는 움직이지 않아요. D 또는 R을 선택해주세요.");
      inputs.current.add(input);
      setHeld([...inputs.current]);
    },
    [active, paused],
  );
  const release = useCallback((input: DriverInput) => {
    inputs.current.delete(input);
    setHeld([...inputs.current]);
  }, []);
  useEffect(() => {
    if (!active || paused) return;
    const map: Record<string, DriverInput> = {
      KeyW: "throttle",
      ArrowUp: "throttle",
      KeyS: "brake",
      ArrowDown: "brake",
      KeyA: "left",
      ArrowLeft: "left",
      KeyD: "right",
      ArrowRight: "right",
    };
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
      if (map[e.code]) {
        e.preventDefault();
        press(map[e.code]);
      }
      const gears: Record<string, Gear> = { KeyE: "D", KeyQ: "R", KeyP: "P" };
      if (gears[e.code] && !e.repeat) {
        e.preventDefault();
        shift(gears[e.code]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (map[e.code]) release(map[e.code]);
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
          last = engine.current.step(
            driverCommand(
              gearRef.current,
              inputs.current,
              previous.current,
              scenario.vehicle,
              FIXED_DT_S,
              analogSteer.current,
            ),
          );
          previous.current = last.appliedCommand;
          accumulator -= FIXED_DT_S;
          if (last.outcome.terminated) {
            setResult(last);
            stop();
            return;
          }
        }
        if (last) setResult(last);
      } catch (error) {
        setFailure(
          error instanceof Error ? error.message : "주행을 중단했어요.",
        );
        stop();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      inputs.current.clear();
      analogSteer.current = null;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [active, paused, pause, stop, press, release, scenario, shift]);
  return {
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
      if (reset()) setActive(true);
    },
    resume: () => {
      clearInputs();
      setPaused(false);
    },
  };
}
