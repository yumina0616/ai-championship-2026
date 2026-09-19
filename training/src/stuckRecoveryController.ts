// #17 (사용자 제안 아이디어): 실제 브라우저 플레이에서 "애매한 상황·충돌 직전에 기어(전후진)를
// 계속 왔다갔다 하며 못 빠져나오는" 패턴을 관찰했다. 참고 선행연구:
// - ROS Navigation Stack의 recovery behaviors(rotate_recovery, clear_costmap_recovery) —
//   "막혔다"고 판단되면 정해진 탈출 동작을 강제 실행하는 구조.
// - Potential-field 국소최소값 탈출의 "kick"(짧은 시간 강한 개입으로 빠져나오기).
// - Tabu Search(Glover, 1986) — 최근 반복한 행동을 일정 기간 금지한다는 개념.
// - 주차 제어 문헌의 "direction switching(chattering)" — 전후진 반복 자체가 이름 붙은 문제.
//
// (갱신 1) 처음엔 "최근 N스텝 안 기어 전환 횟수"를 트리거로 썼는데, 맵 경계 인식을 고친 새
// 모델로 실제 실패 사례를 까보니 충돌 직전 기어 전환이 0~1번뿐이었다 — 트리거 조건 자체가
// 지금 모델의 실패 패턴과 안 맞아서 거의 발동을 안 했다.
//
// (갱신 2) "목표까지 직선거리가 안 줄면 막힘"으로 바꿔봤더니 이번엔 반대로 과발동했다 —
// 후진 주차처럼 정상적인 회전 기동 중엔 직선거리가 일시적으로 안 줄거나 늘 수도 있는데
// (도로 곡선을 따라가려면 잠깐 목표에서 멀어져야 할 때가 있음), 그걸 "막혔다"고 오판해서
// 잘 되던 시나리오(neighbors 3/4→1/4)까지 망가뜨렸다. ROS의 실제 oscillation_distance는
// "목표에 가까워졌는가"가 아니라 "차량이 실제로 움직였는가"(로봇 자신의 물리적 변위)를
// 본다 — 그걸 그대로 따라 "최근 windowSteps 동안 차량이 minDisplacementM만큼도 실제로
// 이동하지 않았으면" 트리거로 바꿨다. 정상적인 회전 기동은(위치는 계속 바뀌므로) 안 걸리고,
// 진짜 제자리에 갇힌 경우만 잡는다.
//
// 목표 근처에서 정상적으로 정지해 hold_time_s를 채우는 중(성공 직전)까지 "막혔다"고 오판하지
// 않도록 ignoreWithinM 안에서는 트리거를 아예 안 본다(이건 목표까지 거리 기준 그대로 유지).
//
// (Hybrid A* 킥은) poseTruth가 필요해 순수 "learned" 정책이 아니라 planner를 함께 쓰는
// hybrid로 취급해야 한다(docs/contracts.md의 plannerUsesTruth 표시 대상). 그런데 프로젝트
// 취지상(#14 "같은 환경의 사람·정책 실행 비교") 사람은 정확한 좌표를 못 받는데 AI만 받는 건
// 공정한 비교가 아니라는 지적이 나와서, poseTruth를 전혀 안 쓰는 대안 킥을 추가로 만들었다.
//
// (대안 킥 1차 시도, confident-commit) 회귀로 학습한 모델은 애매한 상태에서 "정답 여러 개의
// 평균"(예: 전진도 후진도 정답이었던 비슷한 상태들 -> 거의 0에 가까운 속도)을 내버리는 경향이
// 있다 — Mixture Density Networks(Bishop, 1994), Implicit Behavioral Cloning(Florence et
// al., 2021), Diffusion Policy(Chi et al., 2023)가 공통으로 지적하는 "mode averaging" 문제다.
// 그래서 막혔을 때 정책이 이미 살짝 기울어 있는 방향(출력 부호)을 그대로 확실하게 밀어붙이는
// 킥(createConfidentCommitKick)을 만들었는데, 실제 평가에서 킥 없음(5/12)보다도 나쁜 3/12가
// 나왔다 — 위 논문들은 "약한 신호를 증폭"하는 게 아니라 "여러 후보를 직접 비교/채점해서" 고르는
// 거였는데, 우리 구현은 그 비교/검증 단계 없이 부호만 믿고 밀어붙여서, 원래 애매해서 나온
// 거의 무작위에 가까운 부호를 최대 조향+실속력으로 증폭해버리는 역효과를 냈다.
//
// (대안 킥 2차 시도, uncertainty ensemble) 그래서 "증폭 전에 검증"을 추가했다 — 같은 관측에
// 아주 작은 입력 잡음을 여러 번 섞어 모델을 반복 추론(진짜 MC-Dropout은 모델에 Dropout
// 레이어가 있어야 해서, 재학습 없이 쓸 수 있는 입력 섭동 앙상블로 대체)하고, 그 여러 답이
// 얼마나 같은 방향에 동의하는지를 본다. 대부분 동의하면(진짜 확신) 확실하게 밀어붙이고,
// 의견이 갈리면(진짜 애매함) 억지로 어느 한쪽에 걸지 않고 훨씬 조심스럽게(느리게) 움직인다.
// poseTruth를 전혀 안 쓰므로 사람과 동일한 정보만 쓴다.
import * as tf from "@tensorflow/tfjs";
import {
  FIXED_DT_S,
  ParkingEngine,
  appendHoldCommands,
  createRng,
  flattenPrimitiveTargetsToCommands,
  planHybridAStar,
  type Command,
  type Observation,
  type Pose,
  type Scenario,
  type StartState,
  type VehicleSpec,
} from "../../engine/src/index.js";
import { createLearnedController } from "./policyController.js";
import { labelToCommand, observationToFeatures } from "./features.js";

/** 막힘이 감지됐을 때 실행할 탈출 command 시퀀스를 만든다. null이면 원래 정책으로 대체된다. */
export type KickGenerator = (observation: Observation, poseTruth: Pose, lastAppliedCommand: Command) => Command[] | null;

export interface StuckRecoveryOptions {
  /** 이만큼의 스텝 전 차량 위치와 지금 위치를 비교한다. */
  windowSteps: number;
  /** 그 사이 차량이 실제로 이동한 거리가 이보다 작으면 "제자리에 갇혔다"고 판단한다. */
  minDisplacementM: number;
  /** 목표까지 거리가 이보다 가까우면(정상적으로 서행/정지 중일 수 있음) 막힘 판정을 안 한다. */
  ignoreWithinM: number;
  /** 막혔다고 판단되면 Hybrid A* 재계획 결과 중 이만큼의 스텝만 실행하고 학습 정책으로 복귀한다. */
  kickSteps: number;
}

export const DEFAULT_STUCK_RECOVERY_OPTIONS: StuckRecoveryOptions = {
  windowSteps: 30, // FIXED_DT_S=0.05 기준 1.5초
  minDisplacementM: 0.3,
  ignoreWithinM: 1.0, // position_tolerance_m(0.6, examples/scenarios 공통값)보다 여유를 둠
  kickSteps: 20,
};

function goalDistanceM(observation: Observation): number {
  return Math.hypot(observation.goalRelative.xM, observation.goalRelative.yM);
}

function displacementM(a: Pose, b: Pose): number {
  return Math.hypot(a.xM - b.xM, a.yM - b.yM);
}

/**
 * 순수 함수형 뼈대 — 정책과 재계획 함수를 주입받아 테스트하기 쉽게 만들었다. 실제 사용은
 * createStuckRecoveryController(model, scenario)를 통해 tfjs 모델을 감싸서 쓴다.
 */
export function wrapWithStuckRecovery(
  policy: (observation: Observation) => Command,
  kick: KickGenerator,
  options: Partial<StuckRecoveryOptions> = {}
) {
  const opts = { ...DEFAULT_STUCK_RECOVERY_OPTIONS, ...options };
  const poseHistory: Pose[] = [];
  let kickQueue: Command[] = [];

  return (observation: Observation, poseTruth: Pose, lastAppliedCommand: Command): Command => {
    if (kickQueue.length > 0) return kickQueue.shift()!;

    const stuck =
      goalDistanceM(observation) > opts.ignoreWithinM &&
      poseHistory.length >= opts.windowSteps &&
      displacementM(poseHistory[0]!, poseTruth) < opts.minDisplacementM;

    if (stuck) {
      const commands = kick(observation, poseTruth, lastAppliedCommand);
      poseHistory.length = 0; // 킥 이후엔 새로 관찰 시작(바로 재트리거 방지)
      if (commands && commands.length > 0) {
        kickQueue = commands.slice(0, opts.kickSteps);
        return kickQueue.shift()!;
      }
    }

    const command = policy(observation);
    poseHistory.push(poseTruth);
    if (poseHistory.length > opts.windowSteps) poseHistory.shift();
    return command;
  };
}

export function createHybridAStarKick(scenario: Scenario): KickGenerator {
  return (_observation, poseTruth, lastAppliedCommand) => {
    const startOverride = { pose: poseTruth, lastAppliedCommand };
    const plan = planHybridAStar(scenario, {}, startOverride);
    if (!plan.found) return null;
    return appendHoldCommands(
      scenario,
      flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets, {}, startOverride)
    );
  };
}

export interface ConfidentCommitOptions {
  /** 커밋할 때 낼 속도를 최대 속도 대비 비율로 정한다(1.0=최대 속도, 위험하니 기본은 완화). */
  speedScale: number;
}

export const DEFAULT_CONFIDENT_COMMIT_OPTIONS: ConfidentCommitOptions = { speedScale: 0.6 };

/**
 * 특권 정보(poseTruth) 없이, 정책 자신이 이미 살짝 기울어 있는 방향(출력 부호)을 확실하게
 * 밀어붙이는 킥 — observation만 쓰므로 사람과 동일한 정보로 판단한다. 완전히 0(무결정)이면
 * 일단 전진 쪽으로 정한다(사람도 애매하면 아무 방향이나 확실히 시도해보는 것과 같다).
 */
export function createConfidentCommitKick(
  policy: (observation: Observation) => Command,
  vehicle: VehicleSpec,
  options: Partial<ConfidentCommitOptions> = {}
): KickGenerator {
  const opts = { ...DEFAULT_CONFIDENT_COMMIT_OPTIONS, ...options };
  return (observation) => {
    const command = policy(observation);
    const speedSign = command.targetSpeedMps >= 0 ? 1 : -1;
    const steerSign = Math.sign(command.targetSteeringRad) || 1;
    const speedLimit = speedSign > 0 ? vehicle.maxForwardSpeedMps : vehicle.maxReverseSpeedMps;
    const committed: Command = {
      targetSpeedMps: speedSign * speedLimit * opts.speedScale,
      targetSteeringRad: steerSign * vehicle.maxSteeringRad,
    };
    // kickSteps만큼 wrapWithStuckRecovery가 알아서 잘라 쓰므로 넉넉히 채워 반환한다.
    return new Array(200).fill(committed);
  };
}

export interface UncertaintyKickOptions {
  /** 같은 관측을 이만큼 다른 잡음으로 여러 번 평가한다(다수결용, 홀수 권장). */
  ensembleSize: number;
  /** 입력 feature에 섞을 잡음의 표준편차(feature는 대략 [-1,1] 범위로 정규화돼 있음). */
  noiseStd: number;
  /** 이 비율 이상 같은 기어 방향에 동의해야 "확신 있다"고 보고 확실하게(speedScale) 커밋한다. */
  agreementThreshold: number;
  /** 확신이 있을 때 낼 속도(최대 속도 대비). */
  speedScale: number;
  /** 의견이 갈릴 때(애매함) 낼 속도(최대 속도 대비) — 강행하지 않고 훨씬 조심스럽게. */
  cautiousSpeedScale: number;
  /** 잡음 생성용 결정론적 시드 — 같은 상황이면 항상 같은 판단이 나오게 한다(재현성). */
  seed: number;
}

export const DEFAULT_UNCERTAINTY_KICK_OPTIONS: UncertaintyKickOptions = {
  ensembleSize: 7,
  noiseStd: 0.03,
  agreementThreshold: 6 / 7, // 7개 중 6개 이상 동의
  speedScale: 0.6,
  cautiousSpeedScale: 0.2,
  seed: 0,
};

/**
 * 특권 정보(poseTruth) 없이, 같은 관측에 작은 입력 잡음을 여러 번 섞어 모델을 반복 추론해서
 * "이 답이 잡음에 흔들리지 않고 일관되는지"를 확인한 다음에만 확실하게 밀어붙인다 — 여러
 * 번 물어봐도 계속 같은 답이 나오면 확신, 매번 다르게 나오면 진짜 애매한 것이니 조심스럽게.
 */
export function createUncertaintyAwareKick(
  model: tf.LayersModel,
  vehicle: VehicleSpec,
  options: Partial<UncertaintyKickOptions> = {}
): KickGenerator {
  const opts = { ...DEFAULT_UNCERTAINTY_KICK_OPTIONS, ...options };
  const rng = createRng(opts.seed);
  return (observation) => {
    const baseFeatures = observationToFeatures(observation, vehicle);
    const samples: Command[] = [];
    for (let i = 0; i < opts.ensembleSize; i++) {
      const noisyFeatures = baseFeatures.map((v) => v + (rng() * 2 - 1) * opts.noiseStd);
      const label = tf.tidy(() => Array.from((model.predict(tf.tensor2d([noisyFeatures])) as tf.Tensor).dataSync()));
      samples.push(labelToCommand(label, vehicle));
    }

    const forwardVotes = samples.filter((c) => c.targetSpeedMps >= 0).length;
    const majoritySign = forwardVotes >= samples.length - forwardVotes ? 1 : -1;
    const agreement = Math.max(forwardVotes, samples.length - forwardVotes) / samples.length;
    const confident = agreement >= opts.agreementThreshold;

    const agreeing = samples.filter((c) => (c.targetSpeedMps >= 0 ? 1 : -1) === majoritySign);
    const meanSteer = agreeing.reduce((sum, c) => sum + c.targetSteeringRad, 0) / agreeing.length;

    const speedLimit = majoritySign > 0 ? vehicle.maxForwardSpeedMps : vehicle.maxReverseSpeedMps;
    const scale = confident ? opts.speedScale : opts.cautiousSpeedScale;
    const committed: Command = { targetSpeedMps: majoritySign * speedLimit * scale, targetSteeringRad: meanSteer };
    return new Array(200).fill(committed);
  };
}

export function createStuckRecoveryController(
  model: tf.LayersModel,
  scenario: Scenario,
  options: Partial<StuckRecoveryOptions> = {}
) {
  const learned = createLearnedController(model, scenario.vehicle);
  return wrapWithStuckRecovery(learned, createHybridAStarKick(scenario), options);
}

export function createConfidentKickController(
  model: tf.LayersModel,
  scenario: Scenario,
  options: Partial<StuckRecoveryOptions & ConfidentCommitOptions> = {}
) {
  const learned = createLearnedController(model, scenario.vehicle);
  return wrapWithStuckRecovery(learned, createConfidentCommitKick(learned, scenario.vehicle, options), options);
}

export function createUncertaintyKickController(
  model: tf.LayersModel,
  scenario: Scenario,
  options: Partial<StuckRecoveryOptions & UncertaintyKickOptions> = {}
) {
  const learned = createLearnedController(model, scenario.vehicle);
  return wrapWithStuckRecovery(learned, createUncertaintyAwareKick(model, scenario.vehicle, options), options);
}

export interface StuckRecoveryEpisodeResult {
  scenarioId: string;
  terminationReason: string;
  success: boolean;
  collided: boolean;
  kicksTriggered: number;
  stepCount: number;
}

/** evaluate.ts의 runLearnedEpisode와 같은 형태지만, poseTruth를 컨트롤러에 넘겨줘야 해서 별도 루프. */
export function runStuckRecoveryEpisode(
  scenario: Scenario,
  model: tf.LayersModel,
  options: Partial<StuckRecoveryOptions & ConfidentCommitOptions & UncertaintyKickOptions> = {},
  maxSteps = 4000,
  startOverride?: StartState,
  kickMode: "planner" | "confident" | "uncertainty" = "planner"
): StuckRecoveryEpisodeResult {
  const engine = new ParkingEngine();
  let observation = engine.reset(scenario, startOverride);
  let pose: Pose = startOverride?.pose ?? scenario.start;
  let lastApplied: Command = startOverride?.lastAppliedCommand ?? { targetSpeedMps: 0, targetSteeringRad: 0 };
  let kicksTriggered = 0;

  const learned = createLearnedController(model, scenario.vehicle);
  const baseKick =
    kickMode === "confident"
      ? createConfidentCommitKick(learned, scenario.vehicle, options)
      : kickMode === "uncertainty"
        ? createUncertaintyAwareKick(model, scenario.vehicle, options)
        : createHybridAStarKick(scenario);
  const kick: KickGenerator = (obs, poseTruth, lastAppliedCommand) => {
    const commands = baseKick(obs, poseTruth, lastAppliedCommand);
    if (commands) kicksTriggered++;
    return commands;
  };
  const controller = wrapWithStuckRecovery(learned, kick, options);

  let outcome: { terminated: boolean; reason: string | null } = { terminated: false, reason: null };
  let stepCount = 0;
  for (; stepCount < maxSteps; stepCount++) {
    const command = controller(observation, pose, lastApplied);
    const result = engine.step(command, FIXED_DT_S);
    observation = result.observation;
    pose = result.poseTruth;
    lastApplied = result.appliedCommand;
    outcome = result.outcome;
    if (outcome.terminated) {
      stepCount++;
      break;
    }
  }

  return {
    scenarioId: scenario.scenarioId,
    terminationReason: outcome.terminated ? (outcome.reason ?? "unknown") : "incomplete",
    success: outcome.reason === "success",
    collided: outcome.reason === "collision",
    kicksTriggered,
    stepCount,
  };
}
