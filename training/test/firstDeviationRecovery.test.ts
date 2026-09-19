import { describe, expect, it } from "vitest";
import { makeScenario } from "../../web/src/scenario";
import {
  DEFAULT_DEVIATION_OPTIONS,
  findDeviationRecovery,
  findFirstDeviationIndex,
  teacherTrajectoryFor,
} from "../src/firstDeviationRecovery";
import type { TrajectoryStep } from "../src/recoveryAugment";

describe("findFirstDeviationIndex", () => {
  it("teacher와 student가 완전히 같으면 이탈 지점이 없다(null)", () => {
    const scenario = makeScenario("open");
    const shared: TrajectoryStep[] = [
      { pose: { xM: 0, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.1 } },
      { pose: { xM: 0.1, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.1 } },
    ];
    expect(findFirstDeviationIndex(shared, shared, scenario.vehicle)).toBeNull();
  });

  it("command가 임계값 이상 벌어지는 첫 인덱스를 찾는다", () => {
    const scenario = makeScenario("open");
    const teacher: TrajectoryStep[] = [
      { pose: { xM: 0, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.5 } },
      { pose: { xM: 0.1, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.5 } },
      { pose: { xM: 0.2, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.5 } },
    ];
    // 조향을 전혀 안 낸(0) 학생 — 정규화 조향 차이가 커서 index 1에서 걸려야 한다(index 0은 위치도 같고
    // command 차이도 시나리오상 이미 같은 값이라 가정할 수 없으므로 직접 임계값을 넘게 구성).
    const student: TrajectoryStep[] = [
      { pose: { xM: 0, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.5 } },
      { pose: { xM: 0.1, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.0 } },
      { pose: { xM: 0.2, yM: 0, yawRad: 0 }, appliedCommand: { targetSpeedMps: 0.5, targetSteeringRad: 0.0 } },
    ];
    expect(findFirstDeviationIndex(teacher, student, scenario.vehicle)).toBe(1);
  });

  it("위치 차이만으로도 이탈을 감지한다", () => {
    const scenario = makeScenario("open");
    const cmd = { targetSpeedMps: 0, targetSteeringRad: 0 };
    const teacher: TrajectoryStep[] = [{ pose: { xM: 0, yM: 0, yawRad: 0 }, appliedCommand: cmd }];
    const student: TrajectoryStep[] = [{ pose: { xM: 1, yM: 0, yawRad: 0 }, appliedCommand: cmd }];
    expect(findFirstDeviationIndex(teacher, student, scenario.vehicle, { commandDiffThreshold: 10 })).toBe(0);
  });
});

describe("teacherTrajectoryFor + findDeviationRecovery", () => {
  it("open 시나리오의 teacher 궤적 중간 지점에서 복구 계획이 성공한다(이미 정답 경로 위이므로)", () => {
    const scenario = makeScenario("open");
    const teacher = teacherTrajectoryFor(scenario);
    expect(teacher.length).toBeGreaterThan(50);
    // teacher 자신을 "student"로 써서 중간 지점부터 복구 가능한지 확인 — 정답 경로 위이므로
    // 반드시 첫 시도(back=0)에서 성공해야 한다.
    const midIndex = Math.floor(teacher.length / 2);
    const recovery = findDeviationRecovery(scenario, teacher, midIndex, "test-recovery", { maxBackSteps: 0 });
    expect(recovery).not.toBeNull();
    expect(recovery!.recoveryFromIndex).toBe(midIndex);
    expect(recovery!.samples.length).toBeGreaterThan(0);
  }, 30000);
});
