// Hybrid A*: 격자 A*가 아니라 "실제 차량이 낼 수 있는 움직임(motion primitive)"으로 탐색하는
// 경로계획기 (#9 보강). 매 확장마다 몇 개의 (조향각, 전진/후진) 조합을 bicycle model로 실제
// 적분해보고, 장애물에 안 부딪히면서 목표에 가까워지는 후보를 우선순위 큐로 골라나간다.
//
// 범위를 좁힌 부분(정직하게 명시): 원래 Hybrid A*는 보통 Reeds-Shepp 곡선을 휴리스틱/마무리
// 곡선으로 함께 쓰지만, 이 구현은 유클리드 거리 휴리스틱 + 격자 탐색만 쓴다. 정확도보다 이번
// 프로젝트 일정 안에 "장애물을 실제로 피해서 도착하는" 것 자체를 얻는 게 우선이라 판단했다.
//
// 중요한 정합성 포인트: 계획 단계에서 primitive를 "목표 속도로 순간 도달"한다고 가정하면
// 실제 엔진(가속/조향 변화율 clamp가 있는 step())으로 재생했을 때 경로가 어긋나 계획에서는
// 안 부딪히던 장애물에 실제로는 부딪힐 수 있다(실제로 겪은 문제). 그래서 계획도 engine.ts와
// 똑같은 clampCommand를 매 substep마다 적용해 "실제로 실행 가능한" 궤적만 만든다.
import { footprintCollides, footprintFullyInsideGoal, footprintOutOfBounds } from "./collision.js";
import { MinHeap } from "./priorityQueue.js";
import { clampCommand, integrateBicycleModel, normalizeAngle } from "./vehicle.js";
import type { Command, Pose, Scenario } from "./types.js";

export interface HybridAStarOptions {
  /** 이산화 해상도. 너무 작으면 탐색이 느려지고, 너무 크면 좁은 틈을 통과하는 경로를 놓친다. */
  positionResolutionM: number;
  yawResolutionRad: number;
  /** 각 motion primitive가 이동하는 호(arc) 길이. */
  primitiveArcLengthM: number;
  /** primitive를 적분할 때 쓰는 물리 dt. engine.ts의 FIXED_DT_S와 반드시 같아야 재생이 일치한다. */
  integrationDtS: number;
  /** 전진/후진 순항 속도(목표값 — 가속 제한 때문에 실제로는 서서히 도달한다). */
  forwardCruiseSpeedMps: number;
  reverseCruiseSpeedMps: number;
  /** 조향각 후보 개수(0 포함 홀수 권장). */
  steeringSamples: number;
  /** 방향 전환(전진↔후진)에 주는 추가 비용 — 실제 주차처럼 전환 횟수를 아끼게 유도. */
  directionChangeCost: number;
  /** 후진에 곱하는 비용 배수 — 문헌에서 흔히 쓰는 후진 페널티. */
  reversePenaltyFactor: number;
  maxExpansions: number;
  /** 한 primitive 안에서 목표 거리를 못 채우고 무한루프에 빠지지 않도록 하는 안전판. */
  maxSubstepsPerPrimitive: number;
}

export const DEFAULT_HYBRID_ASTAR_OPTIONS: HybridAStarOptions = {
  positionResolutionM: 0.5,
  yawResolutionRad: (2 * Math.PI) / 24,
  primitiveArcLengthM: 1.0,
  integrationDtS: 0.05,
  forwardCruiseSpeedMps: 0.8,
  reverseCruiseSpeedMps: 0.6,
  steeringSamples: 5,
  directionChangeCost: 2.0,
  reversePenaltyFactor: 1.5,
  maxExpansions: 30000,
  maxSubstepsPerPrimitive: 120,
};

interface SearchNode {
  pose: Pose;
  /** 이 노드에 실제로 도달했을 때 엔진이 갖고 있었을 마지막 applied command(가속 clamp 연속성용). */
  lastAppliedCommand: Command;
  gCost: number;
  parent: SearchNode | null;
  /** 이 노드에 도달하기 위해 parent에서 요청한 목표 command(target). */
  requestedCommandFromParent: Command | null;
  lastDirection: 1 | -1 | 0;
}

function stateKey(pose: Pose, opts: HybridAStarOptions): string {
  const xCell = Math.round(pose.xM / opts.positionResolutionM);
  const yCell = Math.round(pose.yM / opts.positionResolutionM);
  const yawCell = Math.round(normalizeAngle(pose.yawRad) / opts.yawResolutionRad);
  return `${xCell}:${yCell}:${yawCell}`;
}

function heuristic(pose: Pose, goal: Pose): number {
  return Math.hypot(pose.xM - goal.xM, pose.yM - goal.yM);
}

/**
 * engine.ts의 isSuccessConditionMetNow()와 같은 기준(속도 조건 제외 — 계획 시점엔 아직 정지
 * 전이라 당연히 못 맞춘다. 정지+유지 시간은 flatten 이후 붙이는 hold 구간이 책임진다).
 */
function isGoal(pose: Pose, scenario: Scenario): boolean {
  const criteria = scenario.successCriteria;
  if (
    criteria.requireFootprintInsideGoal &&
    !footprintFullyInsideGoal(pose, scenario.vehicle, scenario.goalSpace)
  ) {
    return false;
  }
  const positionErrorM = Math.hypot(pose.xM - scenario.goalPose.xM, pose.yM - scenario.goalPose.yM);
  if (positionErrorM > criteria.positionToleranceM) return false;
  const yawErrorRad = Math.abs(normalizeAngle(pose.yawRad - scenario.goalPose.yawRad));
  return yawErrorRad <= criteria.yawToleranceRad;
}

function buildPrimitiveTargets(scenario: Scenario, opts: HybridAStarOptions): Command[] {
  const steerOptions: number[] = [];
  const half = Math.floor(opts.steeringSamples / 2);
  for (let i = -half; i <= half; i++) {
    steerOptions.push((i / half) * scenario.vehicle.maxSteeringRad);
  }
  const forward = Math.min(opts.forwardCruiseSpeedMps, scenario.vehicle.maxForwardSpeedMps);
  const reverse = -Math.min(opts.reverseCruiseSpeedMps, scenario.vehicle.maxReverseSpeedMps);

  const primitives: Command[] = [];
  for (const steer of steerOptions) {
    primitives.push({ targetSpeedMps: forward, targetSteeringRad: steer });
    primitives.push({ targetSpeedMps: reverse, targetSteeringRad: steer });
  }
  return primitives;
}

interface PrimitiveSimResult {
  pose: Pose;
  lastAppliedCommand: Command;
}

/**
 * engine.ts의 step()과 완전히 같은 방식(clampCommand + integrateBicycleModel)으로 target command를
 * arc length만큼 반복 적용한다. onSubstep이 있으면 매 substep의 실제 applied command를 넘겨준다
 * (flatten 단계에서 재생용 command 배열을 만들 때 씀). 도중 충돌하면 null.
 */
function simulatePrimitive(
  startPose: Pose,
  previousApplied: Command,
  target: Command,
  scenario: Scenario,
  opts: HybridAStarOptions,
  onSubstep?: (applied: Command) => void
): PrimitiveSimResult | null {
  let pose = startPose;
  let applied = previousApplied;
  let distanceM = 0;
  let substeps = 0;

  while (distanceM < opts.primitiveArcLengthM && substeps < opts.maxSubstepsPerPrimitive) {
    applied = clampCommand(target, applied, scenario.vehicle, opts.integrationDtS);
    pose = integrateBicycleModel(pose, applied, scenario.vehicle.wheelbaseM, opts.integrationDtS);
    onSubstep?.(applied);

    if (
      footprintCollides(pose, scenario.vehicle, scenario.obstacles) ||
      footprintOutOfBounds(pose, scenario.vehicle, scenario.bounds)
    ) {
      return null;
    }

    distanceM += Math.abs(applied.targetSpeedMps) * opts.integrationDtS;
    substeps++;
  }

  return { pose, lastAppliedCommand: applied };
}

export interface HybridAStarResult {
  found: boolean;
  /** 목표까지의 (speed, steering) 목표 command 시퀀스(primitive 단위). found=false면 빈 배열. */
  primitiveTargets: Command[];
  expandedNodes: number;
}

export function planHybridAStar(
  scenario: Scenario,
  options: Partial<HybridAStarOptions> = {}
): HybridAStarResult {
  const opts = { ...DEFAULT_HYBRID_ASTAR_OPTIONS, ...options };
  const primitiveTemplates = buildPrimitiveTargets(scenario, opts);
  const zeroCommand: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

  const start: SearchNode = {
    pose: scenario.start,
    lastAppliedCommand: zeroCommand,
    gCost: 0,
    parent: null,
    requestedCommandFromParent: null,
    lastDirection: 0,
  };

  const open = new MinHeap<SearchNode>();
  open.push(heuristic(start.pose, scenario.goalPose), start);
  const bestG = new Map<string, number>();
  bestG.set(stateKey(start.pose, opts), 0);

  let expanded = 0;
  while (open.size > 0 && expanded < opts.maxExpansions) {
    const node = open.pop()!;
    expanded++;

    if (isGoal(node.pose, scenario)) {
      return { found: true, primitiveTargets: reconstructPrimitiveTargets(node), expandedNodes: expanded };
    }

    const key = stateKey(node.pose, opts);
    if ((bestG.get(key) ?? Infinity) < node.gCost - 1e-9) continue; // stale 항목

    for (const target of primitiveTemplates) {
      const sim = simulatePrimitive(node.pose, node.lastAppliedCommand, target, scenario, opts);
      if (!sim) continue; // 충돌 또는 경계 이탈

      const direction: 1 | -1 = target.targetSpeedMps >= 0 ? 1 : -1;
      let stepCost = opts.primitiveArcLengthM;
      if (direction === -1) stepCost *= opts.reversePenaltyFactor;
      if (node.lastDirection !== 0 && node.lastDirection !== direction) {
        stepCost += opts.directionChangeCost;
      }

      const childKey = stateKey(sim.pose, opts);
      const childG = node.gCost + stepCost;
      if (childG >= (bestG.get(childKey) ?? Infinity)) continue;

      bestG.set(childKey, childG);
      const child: SearchNode = {
        pose: sim.pose,
        lastAppliedCommand: sim.lastAppliedCommand,
        gCost: childG,
        parent: node,
        requestedCommandFromParent: target,
        lastDirection: direction,
      };
      open.push(childG + heuristic(sim.pose, scenario.goalPose), child);
    }
  }

  return { found: false, primitiveTargets: [], expandedNodes: expanded };
}

function reconstructPrimitiveTargets(goalNode: SearchNode): Command[] {
  const targets: Command[] = [];
  let node: SearchNode | null = goalNode;
  while (node && node.requestedCommandFromParent) {
    targets.push(node.requestedCommandFromParent);
    node = node.parent;
  }
  targets.reverse();
  return targets;
}

/**
 * primitive 목표 command 시퀀스를 고정 dt 단위 applied Command 배열로 풀어낸다. 탐색 때와
 * 똑같은 clampCommand+integrateBicycleModel 재생이므로 engine.step()에 그대로 먹이면
 * (부동소수 오차 제외) 탐색이 검증한 것과 같은 궤적이 나온다.
 */
export function flattenPrimitiveTargetsToCommands(
  scenario: Scenario,
  primitiveTargets: Command[],
  options: Partial<HybridAStarOptions> = {}
): Command[] {
  const opts = { ...DEFAULT_HYBRID_ASTAR_OPTIONS, ...options };
  const commands: Command[] = [];
  let pose = scenario.start;
  let applied: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

  for (const target of primitiveTargets) {
    const sim = simulatePrimitive(pose, applied, target, scenario, opts, (step) => commands.push(step));
    if (!sim) {
      throw new Error("flattenPrimitiveTargetsToCommands: 탐색이 검증한 primitive를 재생하는 중 충돌이 발생했습니다(버그).");
    }
    pose = sim.pose;
    applied = sim.lastAppliedCommand;
  }
  return commands;
}

/**
 * 계획이 끝난 직후엔 보통 아직 움직이는 중이라(가속 clamp 때문에 순간 정지 불가) 곧바로는
 * success의 stopped_speed_mps·hold_time_s 조건을 못 채운다. 정지+유지에 필요한 만큼 0 command를
 * 더 붙여준다 — 감속 시간(속도/가속도) + hold_time_s + 여유 0.5s.
 */
export function appendHoldCommands(
  scenario: Scenario,
  commands: Command[],
  options: Partial<HybridAStarOptions> = {}
): Command[] {
  const opts = { ...DEFAULT_HYBRID_ASTAR_OPTIONS, ...options };
  const lastSpeed = Math.abs(commands[commands.length - 1]?.targetSpeedMps ?? 0);
  const maxAccel = scenario.vehicle.maxAccelerationMps2 ?? 2.0;
  const decelTimeS = lastSpeed / maxAccel;
  const holdStepCount = Math.ceil((decelTimeS + scenario.successCriteria.holdTimeS + 0.5) / opts.integrationDtS);
  const zero: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };
  return [...commands, ...Array.from({ length: holdStepCount }, () => zero)];
}
