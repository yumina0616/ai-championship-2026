// #17 (스무딩): Hybrid A* 원 논문(Dolgov et al. 2008/2010)도 탐색 결과를 그대로 안 쓰고
// 후처리 스무딩을 거친다 — 우리가 발견한 "조향값이 ±1.0/0.5/0에 몰리는" bang-bang 패턴을
// 완화하기 위해, 계획된 command 시퀀스에 이동평균 필터를 적용한 뒤 실제 엔진으로 다시 재생해
// 성공(무충돌+목표도달)하는 경우만 학습 데이터로 채택한다. 실패하면 그냥 버린다(원본 유지 안 함) —
// docs/data-learning.md 원칙(검증 안 된 조작을 정답으로 쓰지 않는다)을 그대로 따름.
import {
  FIXED_DT_S,
  ParkingEngine,
  type Command,
  type Observation,
  type Scenario,
  type StartState,
} from "../../engine/src/index.js";
import { observationToFeatures, commandToLabel } from "./features.js";

export interface SmoothOptions {
  /** 이동평균 창 크기(스텝 수) — 클수록 더 매끄럽지만 원래 경로에서 더 멀어짐. */
  windowSize: number;
}

export const DEFAULT_SMOOTH_OPTIONS: SmoothOptions = { windowSize: 9 };

/** 조향(steering)에만 이동평균을 적용한다 — 속도는 가/감속 자체가 이미 clampCommand로 매끄러움. */
export function smoothSteering(commands: Command[], options: Partial<SmoothOptions> = {}): Command[] {
  const opts = { ...DEFAULT_SMOOTH_OPTIONS, ...options };
  const half = Math.floor(opts.windowSize / 2);
  return commands.map((c, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(commands.length, i + half + 1);
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += commands[j]!.targetSteeringRad;
    return { targetSpeedMps: c.targetSpeedMps, targetSteeringRad: sum / (hi - lo) };
  });
}

export interface SmoothedReplayResult {
  success: boolean;
  samples: { features: number[]; label: number[] }[];
}

/**
 * 스무딩한 command 시퀀스를 실제 엔진으로 처음부터 다시 재생한다(clampCommand가 다시 적용되므로
 * 스무딩한 요청값이 그대로 나가진 않지만, 목표 시퀀스 자체가 부드러워졌으니 실제 적용값도
 * 완만해진다). 재생 중 충돌하거나 끝까지 목표에 못 미치면 실패 처리하고 버린다.
 */
export function replaySmoothedCommands(
  scenario: Scenario,
  commands: Command[],
  startOverride?: StartState
): SmoothedReplayResult {
  const engine = new ParkingEngine();
  let observation = engine.reset(scenario, startOverride);
  const steps: { observationT: Observation; appliedCommandT: Command }[] = [];
  let outcome: { terminated: boolean; reason: string | null } = { terminated: false, reason: null };

  for (const requested of commands) {
    const result = engine.step(requested, FIXED_DT_S);
    steps.push({ observationT: observation, appliedCommandT: result.appliedCommand });
    observation = result.observation;
    outcome = result.outcome;
    if (outcome.terminated) break;
  }

  if (outcome.reason !== "success") return { success: false, samples: [] };
  return {
    success: true,
    samples: steps.map((s) => ({
      features: observationToFeatures(s.observationT, scenario.vehicle),
      label: commandToLabel(s.appliedCommandT, scenario.vehicle),
    })),
  };
}
