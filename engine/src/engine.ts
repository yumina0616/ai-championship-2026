// docs/contracts.md "엔진 인터페이스" 절의 reset()/step() 구현. #5 범위: 차량 제어 + 충돌 + timeout.
// 센서 관측(#7)과 성공 판정(#9)은 아직 없다 — evaluateOutcome()의 순서(충돌 우선)만 미리 맞춰둔다.
import { clampCommand, integrateBicycleModel } from "./vehicle.js";
import { footprintCollides, footprintOutOfBounds } from "./collision.js";
import {
  EngineError,
  type Command,
  type Outcome,
  type Pose,
  type Scenario,
  type StepResult,
} from "./types.js";

export const FIXED_DT_S = 0.05;

const ZERO_COMMAND: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

export class ParkingEngine {
  private scenario: Scenario | null = null;
  private pose: Pose = { xM: 0, yM: 0, yawRad: 0 };
  private simTimeS = 0;
  private lastAppliedCommand: Command = ZERO_COMMAND;
  private terminated = false;

  /** 검증된 scenario로 새 episode를 시작한다. 실패 시 값을 반환하지 않고 throw한다. */
  reset(scenario: Scenario): Pose {
    assertFinite(scenario);
    if (
      footprintCollides(scenario.start, scenario.vehicle, scenario.obstacles) ||
      footprintOutOfBounds(scenario.start, scenario.vehicle, scenario.bounds)
    ) {
      throw new EngineError(
        "start_overlap",
        `시작 footprint가 장애물/경계와 겹칩니다: ${scenario.scenarioId}`
      );
    }

    this.scenario = scenario;
    this.pose = { ...scenario.start };
    this.simTimeS = 0;
    this.lastAppliedCommand = ZERO_COMMAND;
    this.terminated = false;
    return { ...this.pose };
  }

  /** command 1개를 dt만큼 적용한다. reset() 전이거나 이미 종료된 episode면 throw한다. */
  step(requested: Command, dtS: number = FIXED_DT_S): StepResult {
    const scenario = this.scenario;
    if (!scenario) {
      throw new EngineError("invalid_scenario", "step() 전에 reset()을 먼저 호출해야 합니다.");
    }
    if (this.terminated) {
      throw new EngineError(
        "invalid_scenario",
        "이미 종료된 episode입니다. 새로 시작하려면 reset()을 호출하세요."
      );
    }
    if (!Number.isFinite(requested.targetSpeedMps) || !Number.isFinite(requested.targetSteeringRad)) {
      throw new EngineError("not_finite", "command 값(speed/steering)이 유한하지 않습니다.");
    }

    const appliedCommand = clampCommand(
      requested,
      this.lastAppliedCommand,
      scenario.vehicle,
      dtS
    );
    this.pose = integrateBicycleModel(this.pose, appliedCommand, scenario.vehicle.wheelbaseM, dtS);
    this.simTimeS += dtS;
    this.lastAppliedCommand = appliedCommand;

    const outcome = this.evaluateOutcome(scenario);
    if (outcome.terminated) this.terminated = true;

    return {
      pose: { ...this.pose },
      appliedCommand,
      simTimeS: this.simTimeS,
      outcome,
    };
  }

  private evaluateOutcome(scenario: Scenario): Outcome {
    // 충돌을 먼저 검사한다 — docs/contracts.md "같은 tick에 충돌+성공 동시 발생 시 충돌 우선".
    // #9에서 성공 판정을 추가할 때도 이 충돌 검사 다음, timeout 검사 이전에 끼워 넣어야 순서가 유지된다.
    const collided =
      footprintCollides(this.pose, scenario.vehicle, scenario.obstacles) ||
      footprintOutOfBounds(this.pose, scenario.vehicle, scenario.bounds);
    if (collided) return { terminated: true, reason: "collision" };

    if (this.simTimeS >= scenario.timeoutSimS) {
      return { terminated: true, reason: "timeout" };
    }

    return { terminated: false, reason: null };
  }
}

function assertFinite(scenario: Scenario): void {
  const numbers = [
    scenario.start.xM,
    scenario.start.yM,
    scenario.start.yawRad,
    scenario.vehicle.wheelbaseM,
    scenario.vehicle.frontOverhangM,
    scenario.vehicle.rearOverhangM,
    scenario.vehicle.widthM,
    scenario.timeoutSimS,
    scenario.bounds.minX,
    scenario.bounds.maxX,
    scenario.bounds.minY,
    scenario.bounds.maxY,
    ...scenario.obstacles.flatMap((o) => [o.centerXM, o.centerYM, o.lengthM, o.widthM, o.yawRad]),
  ];
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw new EngineError("not_finite", `scenario에 유한하지 않은 값이 있습니다: ${scenario.scenarioId}`);
  }
}
