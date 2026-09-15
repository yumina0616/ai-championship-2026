// 기준 제어기로 scenario를 실행해 docs/contracts.md 형태의 Episode rollout을 만든다 (#9, #9 보강).
import { baselineReverseParkController } from "./baselineController.js";
import { FIXED_DT_S, ParkingEngine } from "./engine.js";
import {
  appendHoldCommands,
  flattenPrimitiveTargetsToCommands,
  planHybridAStar,
  type HybridAStarOptions,
} from "./hybridAStar.js";
import type {
  Command,
  Episode,
  EpisodeHeader,
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

function buildEpisode(
  scenario: Scenario,
  steps: EpisodeStep[],
  outcome: Outcome,
  logComplete: boolean,
  opts: RolloutOptions
): Episode {
  const footer = summarizeFooter(scenario, steps, outcome, logComplete, opts.dtS);
  const header: EpisodeHeader = {
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
  };
  return { header, steps, footer };
}

/**
 * baselineReverseParkController(반응형 pure-pursuit, 장애물 회피 없음)로 scenario를 실행한다.
 * 장애물 없는/단순한 scenario에서의 "가장 단순한 기준선" 용도로 남겨둔다 — 실제 학습 데이터
 * 생성에는 아래 runHybridAStarRollout(장애물 회피 가능)을 쓴다.
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

  return buildEpisode(scenario, steps, outcome, logComplete, opts);
}

export interface HybridAStarRolloutResult {
  episode: Episode | null;
  planFound: boolean;
  expandedNodes: number;
}

/**
 * Hybrid A*로 장애물을 피하는 경로를 먼저 계획한 뒤, 그 command 시퀀스를 engine에 그대로 재생해
 * Episode를 만든다. 계획을 못 찾으면 episode=null을 반환한다(호출자가 로그/스킵 처리).
 */
export function runHybridAStarRollout(
  scenario: Scenario,
  options: Partial<RolloutOptions> = {},
  plannerOptions: Partial<HybridAStarOptions> = {}
): HybridAStarRolloutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const plan = planHybridAStar(scenario, plannerOptions);
  if (!plan.found) {
    return { episode: null, planFound: false, expandedNodes: plan.expandedNodes };
  }

  const plannedTargets = flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets, plannerOptions);
  const commands = appendHoldCommands(scenario, plannedTargets, plannerOptions).slice(0, opts.maxSteps);

  const engine = new ParkingEngine();
  const observation0 = engine.reset(scenario);

  const steps: EpisodeStep[] = [];
  let outcome: Outcome = { terminated: false, reason: null };
  let logComplete = false;
  let previousObservation = observation0;

  for (let stepIndex = 0; stepIndex < commands.length; stepIndex++) {
    const requestedAction = commands[stepIndex]!;
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
    outcome = result.outcome;

    if (result.outcome.terminated) {
      logComplete = true;
      break;
    }
  }

  return {
    episode: buildEpisode(scenario, steps, outcome, logComplete, opts),
    planFound: true,
    expandedNodes: plan.expandedNodes,
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
