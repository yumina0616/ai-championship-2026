// docs/contracts.md "엔진 인터페이스" 절의 reset()/step() 구현.
// #5(차량·충돌) + #7(센서·목표 상대좌표) + #9(성공 판정) 범위.
import { clampCommand, integrateBicycleModel, normalizeAngle } from "./vehicle.js";
import {
  footprintCollides,
  footprintFullyInsideGoal,
  footprintOutOfBounds,
} from "./collision.js";
import { computeSensorScan } from "./sensor.js";
import { computeGoalRelative } from "./goal.js";
import { createRng } from "./rng.js";
import {
  EngineError,
  type Command,
  type Observation,
  type Outcome,
  type Pose,
  type Scenario,
  type StepResult,
  type ParkingStatus,
} from "./types.js";

export const FIXED_DT_S = 0.05;

const ZERO_COMMAND: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };

export class ParkingEngine {
  private scenario: Scenario | null = null;
  private pose: Pose = { xM: 0, yM: 0, yawRad: 0 };
  private simTimeS = 0;
  private lastAppliedCommand: Command = ZERO_COMMAND;
  private terminated = false;
  private rng: () => number = createRng(0);
  private lastSensorUpdateSimTimeS = -Infinity;
  private cachedSensorScan: Observation["sensors"] = [];
  private successHoldStartSimTimeS: number | null = null;

  /** 검증된 scenario로 새 episode를 시작한다. 실패 시 값을 반환하지 않고 throw한다. */
  reset(scenario: Scenario): Observation {
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
    this.rng = createRng(scenario.seed ?? 0);
    this.lastSensorUpdateSimTimeS = -Infinity; // 첫 관측은 항상 새로 계산
    this.cachedSensorScan = [];
    this.successHoldStartSimTimeS = null;

    return this.buildObservation(scenario);
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
      observation: this.buildObservation(scenario),
      poseTruth: { ...this.pose },
      appliedCommand,
      simTimeS: this.simTimeS,
      outcome,
    };
  }

  private buildObservation(scenario: Scenario): Observation {
    const dueForUpdate =
      this.simTimeS - this.lastSensorUpdateSimTimeS >= scenario.sensor.periodS - 1e-9;
    if (dueForUpdate) {
      this.cachedSensorScan = computeSensorScan(
        this.pose,
        scenario.sensor,
        scenario.obstacles,
        this.simTimeS,
        this.rng
      );
      this.lastSensorUpdateSimTimeS = this.simTimeS;
    }

    return {
      sensors: this.cachedSensorScan,
      speedMps: this.lastAppliedCommand.targetSpeedMps,
      steeringRad: this.lastAppliedCommand.targetSteeringRad,
      goalRelative: computeGoalRelative(this.pose, scenario.goalPose),
    };
  }

  private evaluateOutcome(scenario: Scenario): Outcome {
    // 충돌을 먼저 검사한다 — docs/contracts.md "같은 tick에 충돌+성공 동시 발생 시 충돌 우선".
    const status = this.getParkingStatus()!;
    if (status.collision) {
      this.successHoldStartSimTimeS = null;
      return { terminated: true, reason: "collision" };
    }

    if (status.ready) {
      if (this.successHoldStartSimTimeS === null) {
        this.successHoldStartSimTimeS = this.simTimeS;
      }
      const heldForS = this.simTimeS - this.successHoldStartSimTimeS;
      if (heldForS >= scenario.successCriteria.holdTimeS) {
        return { terminated: true, reason: "success" };
      }
    } else {
      this.successHoldStartSimTimeS = null;
    }

    if (this.simTimeS >= scenario.timeoutSimS) {
      return { terminated: true, reason: "timeout" };
    }

    return { terminated: false, reason: null };
  }

  /** 엔진 판정과 화면이 같은 조건/시뮬레이션 타이머를 읽는다. 호출은 시간을 진행시키지 않는다. */
  getParkingStatus(): ParkingStatus | null {
    const scenario = this.scenario;
    if (!scenario) return null;
    const criteria = scenario.successCriteria;
    const collision = footprintCollides(this.pose, scenario.vehicle, scenario.obstacles) ||
      footprintOutOfBounds(this.pose, scenario.vehicle, scenario.bounds);
    const inside = !criteria.requireFootprintInsideGoal ||
      footprintFullyInsideGoal(this.pose, scenario.vehicle, scenario.goalSpace);
    const positionErrorM = Math.hypot(
      this.pose.xM - scenario.goalPose.xM,
      this.pose.yM - scenario.goalPose.yM
    );
    const yawErrorRad = Math.abs(normalizeAngle(this.pose.yawRad - scenario.goalPose.yawRad));
    const positionOk = positionErrorM <= criteria.positionToleranceM;
    const angleOk = yawErrorRad <= criteria.yawToleranceRad;
    const stopped = Math.abs(this.lastAppliedCommand.targetSpeedMps) <= criteria.stoppedSpeedMps;
    const ready = !collision && inside && positionOk && angleOk && stopped;
    return {
      collision, inside, positionErrorM, yawErrorRad, positionOk, angleOk, stopped, ready,
      heldForS: ready && this.successHoldStartSimTimeS !== null
        ? Math.min(criteria.holdTimeS, this.simTimeS - this.successHoldStartSimTimeS) : 0,
      requiredHoldS: criteria.holdTimeS,
    };
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
    scenario.sensor.poseVehicle.xM,
    scenario.sensor.poseVehicle.yM,
    scenario.sensor.poseVehicle.yawRad,
    scenario.sensor.rayCount,
    scenario.sensor.angleMinRad,
    scenario.sensor.angleIncrementRad,
    scenario.sensor.maxRangeM,
    scenario.sensor.periodS,
    scenario.sensor.noiseStdM,
    scenario.goalPose.xM,
    scenario.goalPose.yM,
    scenario.goalPose.yawRad,
    scenario.goalSpace.centerXM,
    scenario.goalSpace.centerYM,
    scenario.goalSpace.lengthM,
    scenario.goalSpace.widthM,
    scenario.goalSpace.yawRad,
    scenario.successCriteria.positionToleranceM,
    scenario.successCriteria.yawToleranceRad,
    scenario.successCriteria.stoppedSpeedMps,
    scenario.successCriteria.holdTimeS,
    ...scenario.obstacles.flatMap((o) => [o.centerXM, o.centerYM, o.lengthM, o.widthM, o.yawRad]),
  ];
  if (numbers.some((n) => !Number.isFinite(n))) {
    throw new EngineError("not_finite", `scenario에 유한하지 않은 값이 있습니다: ${scenario.scenarioId}`);
  }
}
