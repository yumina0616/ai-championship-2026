// 기준 제어기로 scenario를 실행해 docs/contracts.md 형태의 Episode rollout을 만든다 (#9).
import { baselineReverseParkController } from "./baselineController.js";
import { FIXED_DT_S, ParkingEngine } from "./engine.js";
import type {
  Command,
  Episode,
  EpisodeStep,
  Outcome,
  Scenario,
} from "./types.js";

export interface RolloutOptions {
  dtS: number;
  maxSteps: number;
  episodeId: string;
  startedAt: string;
}

const DEFAULT_OPTIONS: RolloutOptions = {
  dtS: FIXED_DT_S,
  maxSteps: 4000, // 4000 * 0.05s = 200s — timeout_sim_s(대개 90s)보다 넉넉한 안전판.
  episodeId: "rollout-unnamed",
  startedAt: new Date(0).toISOString(),
};

/**
 * baselineReverseParkController로 scenario 하나를 끝까지(성공/충돌/timeout/maxSteps) 실행하고
 * Episode를 만든다. controller_kind는 항상 "planner"이고, planner가 truth(poseTruth/goalPose)에
 * 직접 접근했음을 header.metadata.plannerUsesTruth=true로 남긴다.
 */
export function runBaselineRollout(scenario: Scenario, options: Partial<RolloutOptions> = {}): Episode {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const engine = new ParkingEngine();
  const observation0 = engine.reset(scenario);

  const steps: EpisodeStep[] = [];
  let outcome: Outcome = { terminated: false, reason: null };
  let logComplete = false;
  let previousObservation = observation0;
  let poseTruth = scenario.start;

  for (let stepIndex = 0; stepIndex < opts.maxSteps; stepIndex++) {
    const requestedAction: Command = baselineReverseParkController(
      poseTruth,
      scenario.goalPose,
      scenario.vehicle
    );
    const result = engine.step(requestedAction, opts.dtS);

    steps.push({
      stepIndex,
      simTimeS: result.simTimeS,
      observationT: previousObservation,
      requestedActionT: requestedAction,
      appliedCommandT: result.appliedCommand,
      nextStateTruth: result.poseTruth,
      nextOutcome: result.outcome,
      wallTimestamp: new Date(stepIndex * opts.dtS * 1000).toISOString(),
    });

    previousObservation = result.observation;
    poseTruth = result.poseTruth;
    outcome = result.outcome;

    if (result.outcome.terminated) {
      logComplete = true;
      break;
    }
  }

  const footer = summarizeFooter(scenario, steps, outcome, logComplete, opts.dtS);

  return {
    header: {
      episodeId: opts.episodeId,
      schemaVersion: "episode.v1-draft",
      scenarioSnapshot: scenario,
      scenarioVersion: `${scenario.scenarioId}@1`,
      engineVersion: "browser-kinematic-ts.v1-unreleased",
      seed: scenario.seed ?? 0,
      controllerKind: "planner",
      policyVersion: null,
      startedAt: opts.startedAt,
      consent: { status: "not_requested", version: null },
      viewMode: "top_down_full_map",
      assistanceFlags: [],
      metadata: { plannerUsesTruth: true },
    },
    steps,
    footer,
  };
}

function summarizeFooter(
  scenario: Scenario,
  steps: EpisodeStep[],
  outcome: Outcome,
  logComplete: boolean,
  dtS: number
) {
  let distanceTraveledM = 0;
  let directionChanges = 0;
  let previousSign = 0;
  for (const step of steps) {
    distanceTraveledM += Math.abs(step.appliedCommandT.targetSpeedMps) * dtS;
    const sign = Math.sign(step.appliedCommandT.targetSpeedMps);
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) directionChanges++;
    if (sign !== 0) previousSign = sign;
  }

  const lastStep = steps[steps.length - 1];
  const finalPose = lastStep ? lastStep.nextStateTruth : scenario.start;
  const finalPositionErrorM = Math.hypot(
    finalPose.xM - scenario.goalPose.xM,
    finalPose.yM - scenario.goalPose.yM
  );
  const finalYawErrorRad = Math.abs(finalPose.yawRad - scenario.goalPose.yawRad);

  return {
    terminationReason: outcome.terminated ? outcome.reason : ("incomplete" as const),
    totalSimTimeS: lastStep?.simTimeS ?? 0,
    distanceTraveledM,
    directionChanges,
    collided: outcome.reason === "collision",
    finalPositionErrorM: logComplete ? finalPositionErrorM : null,
    finalYawErrorRad: logComplete ? finalYawErrorRad : null,
    success: outcome.reason === "success",
    logComplete,
  };
}

// --- train/validation/heldout 분리 (docs/data-learning.md: 프레임이 아니라 레이아웃군 단위) ---

export interface ScenarioSplit {
  train: Scenario[];
  validation: Scenario[];
  heldout: Scenario[];
}

/**
 * scenario.layoutGroup(없으면 scenarioId)을 기준으로 그룹 전체를 한 split에 배정한다.
 * 같은 맵/시나리오가 train과 heldout에 동시에 새는 것을 구조적으로 막는다.
 */
export function splitScenariosByLayoutGroup(
  scenarios: Scenario[],
  ratios: { train: number; validation: number; heldout: number } = { train: 0.6, validation: 0.2, heldout: 0.2 }
): ScenarioSplit {
  const groups = new Map<string, Scenario[]>();
  for (const scenario of scenarios) {
    const key = scenario.layoutGroup ?? scenario.scenarioId;
    const list = groups.get(key) ?? [];
    list.push(scenario);
    groups.set(key, list);
  }

  const groupKeys = [...groups.keys()].sort(); // 결정론적 순서(입력 순서/Map 순서에 의존하지 않음)
  const total = groupKeys.length;
  const trainCount = Math.round(total * ratios.train);
  const validationCount = Math.round(total * ratios.validation);

  const split: ScenarioSplit = { train: [], validation: [], heldout: [] };
  groupKeys.forEach((key, index) => {
    const bucket =
      index < trainCount ? "train" : index < trainCount + validationCount ? "validation" : "heldout";
    split[bucket].push(...(groups.get(key) ?? []));
  });
  return split;
}
