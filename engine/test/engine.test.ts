import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXED_DT_S, ParkingEngine } from "../src/engine.js";
import { loadScenarioFromJson, type ScenarioJson } from "../src/scenarioLoader.js";
import { EngineError, type Scenario } from "../src/types.js";

function readFixture(relativePath: string): ScenarioJson {
  const text = readFileSync(new URL(`../../examples/scenarios/${relativePath}`, import.meta.url));
  return JSON.parse(text.toString());
}

function straightScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    scenarioId: "test-straight",
    vehicle: {
      wheelbaseM: 2.6,
      frontOverhangM: 0.9,
      rearOverhangM: 0.9,
      widthM: 1.8,
      maxForwardSpeedMps: 1.5,
      maxReverseSpeedMps: 1,
      maxSteeringRad: 0.55,
    },
    bounds: { minX: -5, maxX: 20, minY: -5, maxY: 14 },
    start: { xM: 0, yM: 0, yawRad: 0 },
    obstacles: [{ id: "wall", centerXM: 6.5, centerYM: 0, lengthM: 0.2, widthM: 4, yawRad: 0 }],
    timeoutSimS: 90,
    ...overrides,
  };
}

describe("ParkingEngine — 합성 scenario", () => {
  it("reset()은 start pose를 그대로 반환한다", () => {
    const engine = new ParkingEngine();
    const pose = engine.reset(straightScenario());
    expect(pose).toEqual({ xM: 0, yM: 0, yawRad: 0 });
  });

  it("직진 2초(40step) 후 가속 변화율 제한을 반영한 거리만큼 진행한다", () => {
    // #2 spike(즉시 0.8mps로 설정)와 달리 engine.step()은 clampCommand의 가속 제한(기본 2.0 m/s^2)을
    // 적용한다 — 0→0.8mps까지 8step(0.4s) 램프업이 끼어들어 2초 누적 거리가 1.6m보다 살짝 짧다.
    // 램프업 구간(8step): dt*sum(0.1..0.8) = 0.05*3.6 = 0.18m, 이후 32step*0.8mps*dt = 1.28m, 합 1.46m.
    // 변화율 제한이 없는 순수 bicycle model 수식 자체는 vehicle.test.ts에서 #2 spike 값(1.6m)과 직접 비교한다.
    const engine = new ParkingEngine();
    engine.reset(straightScenario());
    let last;
    for (let i = 0; i < 40; i++) {
      last = engine.step({ targetSpeedMps: 0.8, targetSteeringRad: 0 }, FIXED_DT_S);
    }
    expect(last!.pose.xM).toBeCloseTo(1.46, 6);
    expect(last!.simTimeS).toBeCloseTo(2.0, 6);
    expect(last!.outcome.terminated).toBe(false);
  });

  it("벽에 충돌하면 outcome.reason='collision'이고 그 다음 step은 throw한다", () => {
    const engine = new ParkingEngine();
    engine.reset(straightScenario());
    let result;
    for (let i = 0; i < 200; i++) {
      result = engine.step({ targetSpeedMps: 1.5, targetSteeringRad: 0 }, FIXED_DT_S);
      if (result.outcome.terminated) break;
    }
    expect(result!.outcome).toEqual({ terminated: true, reason: "collision" });
    expect(() => engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 })).toThrow(EngineError);
  });

  it("timeout_sim_s에 도달하면 outcome.reason='timeout'이다(충돌 없이)", () => {
    const engine = new ParkingEngine();
    // 장애물을 충분히 멀리 두고 짧은 timeout으로 설정해 충돌보다 timeout이 먼저 오게 한다.
    engine.reset(
      straightScenario({
        obstacles: [{ id: "wall", centerXM: 100, centerYM: 0, lengthM: 0.2, widthM: 4, yawRad: 0 }],
        timeoutSimS: 0.1,
      })
    );
    let result;
    for (let i = 0; i < 10; i++) {
      result = engine.step({ targetSpeedMps: 0.1, targetSteeringRad: 0 }, FIXED_DT_S);
      if (result.outcome.terminated) break;
    }
    expect(result!.outcome).toEqual({ terminated: true, reason: "timeout" });
  });

  it("reset() 전에 step()을 부르면 throw한다", () => {
    const engine = new ParkingEngine();
    expect(() => engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 })).toThrow(EngineError);
  });

  it("NaN/Infinity command는 clamp가 아니라 거부(throw)한다", () => {
    const engine = new ParkingEngine();
    engine.reset(straightScenario());
    expect(() => engine.step({ targetSpeedMps: NaN, targetSteeringRad: 0 })).toThrow(EngineError);
    expect(() => engine.step({ targetSpeedMps: Infinity, targetSteeringRad: 0 })).toThrow(EngineError);
  });

  it("동일 engine·seed·command를 재실행하면 완전히 같은 결과를 낸다", () => {
    const run = () => {
      const engine = new ParkingEngine();
      engine.reset(straightScenario());
      let last;
      for (let i = 0; i < 10; i++) {
        last = engine.step({ targetSpeedMps: 0.5, targetSteeringRad: 0.2 }, FIXED_DT_S);
      }
      return last!.pose;
    };
    expect(run()).toEqual(run());
  });
});

describe("ParkingEngine — examples/scenarios fixture(#3) 그대로 실행", () => {
  it("reverse-bay.v1.json은 정상적으로 reset된다", () => {
    const scenario = loadScenarioFromJson(readFixture("reverse-bay.v1.json"));
    const engine = new ParkingEngine();
    const pose = engine.reset(scenario);
    expect(pose).toEqual({ xM: 11, yM: 8, yawRad: 0 });
  });

  it("invalid-overlap-start.v1.json은 start_overlap으로 거부된다", () => {
    const scenario = loadScenarioFromJson(readFixture("invalid-overlap-start.v1.json"));
    const engine = new ParkingEngine();
    expect(() => engine.reset(scenario)).toThrow(EngineError);
    try {
      engine.reset(scenario);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe("start_overlap");
    }
  });
});
