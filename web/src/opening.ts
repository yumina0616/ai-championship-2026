import {
  ParkingEngine,
  baselineReverseParkController,
  type StepResult,
} from "../../engine/src/index";
import { makeScenario } from "./driving";

export const OPENING_RATE = 2;

// 표현용 기록: 학습 정책이 아니라 truth 기반 기준 제어기의 쉬운 정렬 주차입니다.
// 수동 운전 엔진/센서/기록과 독립적이며, 성공을 연출로 만들어 내지 않습니다.
export function buildOpening(): StepResult[] {
  const scenario = makeScenario("open");
  scenario.start = { xM: 0, yM: -2.1, yawRad: -Math.PI / 2 };
  const engine = new ParkingEngine();
  const frames: StepResult[] = [
    {
      observation: engine.reset(scenario),
      poseTruth: { ...scenario.start },
      simTimeS: 0,
      appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 },
      outcome: { terminated: false, reason: null },
    },
  ];
  // 최대 12초만 계산합니다. 제어기/판정 계약이 바뀌어 실패하면 오프닝을 생략합니다.
  for (let i = 0; i < 240; i++) {
    const result = engine.step(
      baselineReverseParkController(
        frames.at(-1)!.poseTruth,
        scenario.goalPose,
        scenario.vehicle,
        { arrivalDistanceM: 0.01, speedGain: 2 },
      ),
    );
    frames.push(result);
    if (result.outcome.terminated)
      return result.outcome.reason === "success" ? frames : [];
  }
  return [];
}
