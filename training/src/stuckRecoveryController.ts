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
// poseTruth가 필요해 순수 "learned" 정책이 아니라 planner를 함께 쓰는 hybrid로 취급해야 한다
// (docs/contracts.md의 plannerUsesTruth 표시 대상 — 실제 배포하려면 이 표시를 추가해야 함).
import * as tf from "@tensorflow/tfjs";
import {
  FIXED_DT_S,
  ParkingEngine,
  appendHoldCommands,
  flattenPrimitiveTargetsToCommands,
  planHybridAStar,
  type Command,
  type Observation,
  type Pose,
  type Scenario,
  type StartState,
} from "../../engine/src/index.js";
import { createLearnedController } from "./policyController.js";

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
  replan: (poseTruth: Pose, lastAppliedCommand: Command) => Command[] | null,
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
      const commands = replan(poseTruth, lastAppliedCommand);
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

export function createStuckRecoveryController(
  model: tf.LayersModel,
  scenario: Scenario,
  options: Partial<StuckRecoveryOptions> = {}
) {
  const learned = createLearnedController(model, scenario.vehicle);
  const replan = (poseTruth: Pose, lastAppliedCommand: Command): Command[] | null => {
    const startOverride = { pose: poseTruth, lastAppliedCommand };
    const plan = planHybridAStar(scenario, {}, startOverride);
    if (!plan.found) return null;
    return appendHoldCommands(
      scenario,
      flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets, {}, startOverride)
    );
  };
  return wrapWithStuckRecovery(learned, replan, options);
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
  options: Partial<StuckRecoveryOptions> = {},
  maxSteps = 4000,
  startOverride?: StartState
): StuckRecoveryEpisodeResult {
  const engine = new ParkingEngine();
  let observation = engine.reset(scenario, startOverride);
  let pose: Pose = startOverride?.pose ?? scenario.start;
  let lastApplied: Command = startOverride?.lastAppliedCommand ?? { targetSpeedMps: 0, targetSteeringRad: 0 };
  let kicksTriggered = 0;

  const learned = createLearnedController(model, scenario.vehicle);
  const replan = (poseTruth: Pose, lastAppliedCommand: Command): Command[] | null => {
    const startOverride = { pose: poseTruth, lastAppliedCommand: lastAppliedCommand };
    const plan = planHybridAStar(scenario, {}, startOverride);
    if (!plan.found) return null;
    kicksTriggered++;
    return appendHoldCommands(
      scenario,
      flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets, {}, startOverride)
    );
  };
  const controller = wrapWithStuckRecovery(learned, replan, options);

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
