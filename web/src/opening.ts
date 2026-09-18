import {
  ParkingEngine,
  baselineReverseParkController,
  type StepResult,
} from "../../engine/src/index";
import { makeScenario } from "./driving";

export const OPENING_DURATION_S = 6.8;
export const OPENING_SHOTS = [
  { title: "Built to move.", label: "01 / BODY", detail: "차체와 조향 · 같은 차량 기하 모델" },
  { title: "Sense the invisible.", label: "02 / PERCEPTION", detail: "가상 거리 센서 · 기록된 실제 광선 교차 결과" },
  { title: "Every move, measured.", label: "03 / CONTROL", detail: "기준 제어기의 주행 궤적 · 학습 정책 아님" },
  { title: "Your turn to drive.", label: "04 / PLAY", detail: "보고, 조작하고, 나만의 주차를 실험하세요" },
] as const;
export function openingShot(progress: number) { return Math.min(3, Math.floor(Math.max(0, progress) * 4)); }

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
