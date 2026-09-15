// docs/contracts.md 기준 타입. #5 범위(차량·충돌)만 다루며 센서(#7)는 포함하지 않는다.

export interface VehicleSpec {
  wheelbaseM: number;
  frontOverhangM: number;
  rearOverhangM: number;
  widthM: number;
  maxForwardSpeedMps: number;
  maxReverseSpeedMps: number;
  maxSteeringRad: number;
  /** 변화율(가속/조향 속도) 제한. 미지정 시 engine.ts의 기본값을 쓴다 — 실제 차량값은 미확정(#5 PR에서 논의 필요). */
  maxAccelerationMps2?: number;
  maxSteeringRateRadPerS?: number;
}

/** 회전한 직사각형 장애물. pose는 중심 기준. */
export interface RectObstacle {
  id: string;
  centerXM: number;
  centerYM: number;
  lengthM: number;
  widthM: number;
  yawRad: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Pose {
  xM: number;
  yM: number;
  yawRad: number;
}

export interface Scenario {
  scenarioId: string;
  vehicle: VehicleSpec;
  bounds: WorldBounds;
  start: Pose;
  obstacles: RectObstacle[];
  timeoutSimS: number;
}

export interface Command {
  targetSpeedMps: number;
  targetSteeringRad: number;
}

export type TerminationReason =
  | "collision"
  | "timeout"
  | "user_abort"
  | "success"
  | null;

export interface Outcome {
  terminated: boolean;
  reason: TerminationReason;
}

export type EngineErrorCode =
  | "invalid_scenario"
  | "start_overlap"
  | "not_finite";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly retryable = false as const;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "EngineError";
  }
}

export interface StepResult {
  pose: Pose;
  appliedCommand: Command;
  simTimeS: number;
  outcome: Outcome;
}
