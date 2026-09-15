import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runBaselineRollout, splitScenariosByLayoutGroup } from "../src/rollout.js";
import { loadScenarioFromJson, type ScenarioJson } from "../src/scenarioLoader.js";
import type { Scenario } from "../src/types.js";

function readFixture(relativePath: string): ScenarioJson {
  const text = readFileSync(new URL(`../../examples/scenarios/${relativePath}`, import.meta.url));
  return JSON.parse(text.toString());
}

function simpleScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    scenarioId: "rollout-simple",
    vehicle: {
      wheelbaseM: 2.6,
      frontOverhangM: 0.9,
      rearOverhangM: 0.9,
      widthM: 1.8,
      maxForwardSpeedMps: 1.5,
      maxReverseSpeedMps: 1,
      maxSteeringRad: 0.55,
    },
    bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 },
    start: { xM: 5, yM: 1, yawRad: 0 },
    obstacles: [],
    timeoutSimS: 30,
    sensor: {
      id: "front",
      poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
      rayCount: 1,
      angleMinRad: 0,
      angleIncrementRad: 0,
      maxRangeM: 10,
      periodS: 0.05,
      noiseStdM: 0,
    },
    goalPose: { xM: 0, yM: 0, yawRad: 0 },
    goalSpace: { centerXM: 0, centerYM: 0, lengthM: 100, widthM: 100, yawRad: 0 },
    successCriteria: {
      positionToleranceM: 0.3,
      yawToleranceRad: 1.0,
      stoppedSpeedMps: 0.1,
      holdTimeS: 0.1,
      requireFootprintInsideGoal: false,
      collisionTerminates: true,
    },
    seed: 1,
    ...overrides,
  };
}

describe("runBaselineRollout", () => {
  it("간단한 오프셋 scenario는 Episode 형태를 갖추고 success로 끝난다", () => {
    const episode = runBaselineRollout(simpleScenario(), { episodeId: "ep-test-1" });

    expect(episode.header.controllerKind).toBe("planner");
    expect(episode.header.metadata.plannerUsesTruth).toBe(true);
    expect(episode.header.policyVersion).toBeNull();
    expect(episode.steps.length).toBeGreaterThan(0);
    expect(episode.footer.logComplete).toBe(true);
    expect(episode.footer.success).toBe(true);
    expect(episode.footer.collided).toBe(false);

    // step끼리 관측/행동/상태가 정렬되어 있는지(빈 값·NaN 없이).
    for (const step of episode.steps) {
      expect(Number.isFinite(step.nextStateTruth.xM)).toBe(true);
      expect(Number.isFinite(step.appliedCommandT.targetSpeedMps)).toBe(true);
    }
  });

  it("실제 examples/scenarios/reverse-bay.v1.json(#3 fixture)에 대해 실제로 실행해본 결과를 정직하게 기록한다", () => {
    const scenario = loadScenarioFromJson(readFixture("reverse-bay.v1.json"));
    const episode = runBaselineRollout(scenario, { episodeId: "ep-reverse-bay-1" });

    // 이 baseline은 장애물 회피 경로계획이 없는 단순 피드백 제어이므로 성공을 보장하지 않는다
    // (docs/development.md 구현 경계: "최적 경로 보장" 제외). 실제로 무엇으로 끝났는지만 검증한다.
    expect(episode.footer.logComplete).toBe(true); // 최소한 유한 시간 안에 종료는 됨(무한루프 아님)
    expect(["success", "collision", "timeout"]).toContain(episode.footer.terminationReason);
    expect(episode.steps.length).toBeGreaterThan(0);
  });
});

describe("splitScenariosByLayoutGroup", () => {
  function fakeScenario(id: string, layoutGroup: string): Scenario {
    return simpleScenario({ scenarioId: id, layoutGroup });
  }

  it("같은 layoutGroup의 scenario들은 항상 같은 split에 함께 들어간다", () => {
    const scenarios = [
      fakeScenario("a1", "layout-a"),
      fakeScenario("a2", "layout-a"),
      fakeScenario("b1", "layout-b"),
      fakeScenario("c1", "layout-c"),
      fakeScenario("d1", "layout-d"),
      fakeScenario("e1", "layout-e"),
    ];
    const split = splitScenariosByLayoutGroup(scenarios, { train: 0.6, validation: 0.2, heldout: 0.2 });

    const findBucket = (id: string) => {
      if (split.train.some((s) => s.scenarioId === id)) return "train";
      if (split.validation.some((s) => s.scenarioId === id)) return "validation";
      return "heldout";
    };
    expect(findBucket("a1")).toBe(findBucket("a2")); // 같은 레이아웃군은 항상 같은 split

    const total = split.train.length + split.validation.length + split.heldout.length;
    expect(total).toBe(scenarios.length);
  });

  it("layoutGroup을 지정하지 않으면 scenarioId 자체를 그룹으로 쓴다", () => {
    const scenarios = [simpleScenario({ scenarioId: "solo-1" }), simpleScenario({ scenarioId: "solo-2" })];
    const split = splitScenariosByLayoutGroup(scenarios);
    const total = split.train.length + split.validation.length + split.heldout.length;
    expect(total).toBe(2);
  });
});
