import { describe, expect, it } from "vitest";
import {
  appendHoldCommands,
  flattenPrimitiveTargetsToCommands,
  planHybridAStar,
  type Command,
  type Observation,
} from "../../engine/src/index";
import { makeScenario } from "../../web/src/scenario";
import {
  DEFAULT_RECOVERY_CANDIDATE_OPTIONS,
  findRecoveryCandidates,
  generateRecoverySamples,
  runLearnedEpisodeWithTrajectory,
  type FailedRollout,
} from "../src/recoveryAugment";
import { FEATURE_SIZE, LABEL_SIZE } from "../src/features";

const ZERO: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

describe("findRecoveryCandidates", () => {
  it("head/tail exclusion과 stride를 지켜서 후보를 뽑는다", () => {
    const scenario = makeScenario("open");
    // scenario.start 근처, bounds 안이고 장애물과 안 겹치는 위치에 고정된 100스텝짜리 가짜 궤적.
    const trajectory = Array.from({ length: 100 }, () => ({
      pose: { xM: scenario.start.xM, yM: scenario.start.yM, yawRad: 0 },
      appliedCommand: ZERO,
    }));
    const failed: FailedRollout = { scenario, trajectory, terminationReason: "timeout" };

    const candidates = findRecoveryCandidates(failed);
    const { headExclusionSteps, tailExclusionSteps, strideSteps } = DEFAULT_RECOVERY_CANDIDATE_OPTIONS;
    const expectedLastIndex = trajectory.length - 1 - tailExclusionSteps;
    const expectedCount = Math.floor((expectedLastIndex - headExclusionSteps) / strideSteps) + 1;
    expect(candidates.length).toBe(expectedCount);
  });

  it("이미 충돌 중인 pose는 후보에서 제외한다", () => {
    const scenario = makeScenario("open");
    const obstacle = scenario.obstacles[0]!;
    const trajectory = Array.from({ length: 60 }, (_, i) => ({
      // 딱 하나(head/tail 안쪽 인덱스)만 장애물 한가운데로 겹치게 만든다.
      pose:
        i === 50
          ? { xM: obstacle.centerXM, yM: obstacle.centerYM, yawRad: obstacle.yawRad }
          : { xM: 100, yM: 100, yawRad: 0 },
      appliedCommand: ZERO,
    }));
    const failed: FailedRollout = { scenario, trajectory, terminationReason: "collision" };

    const candidates = findRecoveryCandidates(failed, { headExclusionSteps: 45, tailExclusionSteps: 5, strideSteps: 1 });
    expect(candidates.some((c) => c.pose.xM === obstacle.centerXM && c.pose.yM === obstacle.centerYM)).toBe(false);
  });
});

describe("runLearnedEpisodeWithTrajectory", () => {
  it("정지만 하는 컨트롤러는 timeout으로 끝나고 궤적을 남긴다(복구 대상)", () => {
    const scenario = makeScenario("open");
    const result = runLearnedEpisodeWithTrajectory(scenario, () => ZERO);
    expect(result).not.toBeNull();
    expect(result!.terminationReason).toBe("timeout");
    expect(result!.trajectory.length).toBeGreaterThan(0);
  });

  it("실제로 성공하는 주행(Hybrid A* 계획 재생)은 null을 반환한다(복구 불필요)", () => {
    const scenario = makeScenario("open");
    const plan = planHybridAStar(scenario);
    expect(plan.found).toBe(true);
    const commands = appendHoldCommands(scenario, flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets));

    let i = 0;
    const controller = (_observation: Observation): Command => commands[Math.min(i++, commands.length - 1)] ?? ZERO;

    const result = runLearnedEpisodeWithTrajectory(scenario, controller);
    expect(result).toBeNull();
  }, 20000);
});

describe("generateRecoverySamples", () => {
  it("정지 상태에서 뽑은 후보는 Hybrid A*로 복구 경로를 찾아 (features,label) 샘플을 만든다", () => {
    const scenario = makeScenario("open");
    // 실제로 정지 컨트롤러로 뽑아낸 "진짜" 중간 상태 후보를 쓴다(임의로 지어내지 않음).
    const failed = runLearnedEpisodeWithTrajectory(scenario, () => ZERO)!;
    const [candidate] = findRecoveryCandidates(failed, { headExclusionSteps: 5, tailExclusionSteps: 5, strideSteps: 1 });
    expect(candidate).toBeDefined();

    const samples = generateRecoverySamples(scenario, candidate!, "test-recovery");
    expect(samples).not.toBeNull();
    expect(samples!.length).toBeGreaterThan(0);
    expect(samples![0]!.features).toHaveLength(FEATURE_SIZE);
    expect(samples![0]!.label).toHaveLength(LABEL_SIZE);
  }, 20000);

  it("계획 예산이 너무 작아 Hybrid A*가 실패하면 null을 반환하고(억지로 데이터를 만들지 않음)", () => {
    const scenario = makeScenario("open");
    const candidate = { pose: scenario.start, lastAppliedCommand: ZERO };
    const samples = generateRecoverySamples(scenario, candidate, "test-recovery-fail", { maxExpansions: 1 });
    expect(samples).toBeNull();
  });
});
