import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/src/index";
import { makeScenario } from "../../web/src/scenario";
import {
  DEFAULT_JITTER_OPTIONS,
  generateJitteredRolloutSamples,
  jitterPose,
} from "../src/startPoseAugment";
import { FEATURE_SIZE, LABEL_SIZE } from "../src/features";

describe("jitterPose", () => {
  it("같은 rng 시퀀스면 항상 같은 결과(재현 가능성)", () => {
    const pose = { xM: 1, yM: 2, yawRad: 0.1 };
    const a = jitterPose(pose, createRng(42), DEFAULT_JITTER_OPTIONS);
    const b = jitterPose(pose, createRng(42), DEFAULT_JITTER_OPTIONS);
    expect(a).toEqual(b);
  });

  it("흔든 정도가 설정한 범위를 넘지 않는다", () => {
    const pose = { xM: 0, yM: 0, yawRad: 0 };
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const jittered = jitterPose(pose, rng, DEFAULT_JITTER_OPTIONS);
      expect(Math.abs(jittered.xM)).toBeLessThanOrEqual(DEFAULT_JITTER_OPTIONS.positionJitterM);
      expect(Math.abs(jittered.yM)).toBeLessThanOrEqual(DEFAULT_JITTER_OPTIONS.positionJitterM);
      expect(Math.abs(jittered.yawRad)).toBeLessThanOrEqual(DEFAULT_JITTER_OPTIONS.yawJitterRad);
    }
  });
});

describe("generateJitteredRolloutSamples", () => {
  it("장애물과 안 겹치는 근처 시작점은 Hybrid A*로 성공 경로를 찾아 (features,label) 샘플을 만든다", () => {
    const scenario = makeScenario("open");
    // scenario.start를 아주 살짝만 흔든, 실제로 안 겹치는 값.
    const jittered = { xM: scenario.start.xM + 0.1, yM: scenario.start.yM, yawRad: scenario.start.yawRad };
    const samples = generateJitteredRolloutSamples(scenario, jittered, "test-jitter");
    expect(samples).not.toBeNull();
    expect(samples!.length).toBeGreaterThan(0);
    expect(samples![0]!.features).toHaveLength(FEATURE_SIZE);
    expect(samples![0]!.label).toHaveLength(LABEL_SIZE);
  }, 20000);

  it("이미 장애물과 겹치는 흔든 위치는 Hybrid A*를 시도조차 안 하고 null을 반환한다", () => {
    const scenario = makeScenario("open");
    const obstacle = scenario.obstacles[0]!;
    const collidingPose = { xM: obstacle.centerXM, yM: obstacle.centerYM, yawRad: obstacle.yawRad };
    const samples = generateJitteredRolloutSamples(scenario, collidingPose, "test-jitter-collide");
    expect(samples).toBeNull();
  });
});
