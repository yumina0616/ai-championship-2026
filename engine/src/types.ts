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

/** 차량 로컬 좌표계에 고정된 pose(예: 센서 장착 위치). +x 전방, +y 왼쪽. */
export type VehicleLocalPose = Pose;

export interface SensorSpec {
  id: string;
  /** 차량 로컬 좌표계 기준 장착 pose. */
  poseVehicle: VehicleLocalPose;
  rayCount: number;
  angleMinRad: number;
  angleIncrementRad: number;
  maxRangeM: number;
  /** 갱신 주기. 물리 dt보다 크면 그 사이 step에서는 이전 값을 그대로 반환한다. */
  periodS: number;
  /** 가우시안 노이즈 표준편차(m). 0이면 무잡음(기본 검증 기준). */
  noiseStdM: number;
}

export interface RangeReading {
  angleRad: number;
  rangeM: number;
  /** true: 유효한 측정(미검출 포함, 이 경우 rangeM=maxRangeM). false: 센서 결측/오류(rangeM=NaN, 0으로 오인 금지). */
  valid: boolean;
  updatedSimTimeS: number;
}

export interface Scenario {
  scenarioId: string;
  vehicle: VehicleSpec;
  bounds: WorldBounds;
  start: Pose;
  obstacles: RectObstacle[];
  timeoutSimS: number;
  sensor: SensorSpec;
  /** 목표 pose(세계 좌표). Observation에는 차량 기준 상대값으로 변환해 넣는다. */
  goalPose: Pose;
  /** 센서 노이즈 PRNG seed. 미지정 시 0. */
  seed?: number;
}

export interface Observation {
  sensors: RangeReading[];
  speedMps: number;
  steeringRad: number;
  /** 차량(뒷차축) 기준 목표의 상대 pose. localization_source: simulation_ground_truth. */
  goalRelative: Pose;
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
  observation: Observation;
  /** 정답 pose. 정책 입력이 아니라 기록/평가 전용 — docs/contracts.md "관측과 정답의 분리". */
  poseTruth: Pose;
  appliedCommand: Command;
  simTimeS: number;
  outcome: Outcome;
}
