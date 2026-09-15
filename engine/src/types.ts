// docs/contracts.md 기준 타입. #5(차량·충돌)·#7(센서·목표좌표)·#9(성공 판정) 범위.

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

/** 회전한 직사각형(장애물/목표 공간/차량 footprint가 모두 이 모양). collision.ts가 소비한다. */
export interface OrientedRect {
  centerXM: number;
  centerYM: number;
  /** 로컬 +x(전방) 방향 전체 길이 */
  lengthM: number;
  /** 로컬 +y(왼쪽) 방향 전체 폭 */
  widthM: number;
  yawRad: number;
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

export interface SuccessCriteria {
  positionToleranceM: number;
  yawToleranceRad: number;
  stoppedSpeedMps: number;
  holdTimeS: number;
  requireFootprintInsideGoal: boolean;
  /** 우리 엔진은 항상 충돌 우선 종료를 쓴다 — 계약값을 그대로 보존해 fixture와 불일치를 감지한다. */
  collisionTerminates: boolean;
}

export interface Scenario {
  scenarioId: string;
  /** train/validation/heldout을 프레임이 아니라 맵 단위로 나누기 위한 레이아웃군 키. 미지정 시 scenarioId를 쓴다. */
  layoutGroup?: string;
  vehicle: VehicleSpec;
  bounds: WorldBounds;
  start: Pose;
  obstacles: RectObstacle[];
  timeoutSimS: number;
  sensor: SensorSpec;
  /** 목표 pose(세계 좌표). Observation에는 차량 기준 상대값으로 변환해 넣는다. */
  goalPose: Pose;
  /** 목표 공간(세계 좌표 회전 직사각형). 성공 판정의 "차체가 포함되는가" 검사에 쓴다. */
  goalSpace: OrientedRect;
  successCriteria: SuccessCriteria;
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

/** 읽기 전용 평가 상태. HUD용 truth 정보이며 정책 Observation에는 넣지 않는다. */
export interface ParkingStatus {
  collision: boolean;
  inside: boolean;
  positionErrorM: number;
  yawErrorRad: number;
  positionOk: boolean;
  angleOk: boolean;
  stopped: boolean;
  ready: boolean;
  heldForS: number;
  requiredHoldS: number;
}

// --- Episode (docs/contracts.md "Episode" 절) ---

export type ControllerKind = "human" | "planner" | "learned" | "mock";

export interface EpisodeHeader {
  episodeId: string;
  schemaVersion: string;
  scenarioSnapshot: Scenario;
  scenarioVersion: string;
  engineVersion: string;
  seed: number;
  controllerKind: ControllerKind;
  policyVersion: string | null;
  startedAt: string;
  consent: { status: "not_requested" | "granted" | "declined"; version: string | null };
  viewMode: string;
  assistanceFlags: string[];
  /** planner/learned가 truth(전체 장애물 좌표·절대 pose 등)에 접근했는지 명시 — #9 요구사항. */
  metadata: { plannerUsesTruth: boolean };
}

export interface EpisodeStep {
  stepIndex: number;
  simTimeS: number;
  observationT: Observation;
  requestedActionT: Command;
  appliedCommandT: Command;
  nextStateTruth: Pose;
  nextOutcome: Outcome;
  wallTimestamp: string;
}

export interface EpisodeFooter {
  terminationReason: TerminationReason | "incomplete";
  totalSimTimeS: number;
  distanceTraveledM: number;
  directionChanges: number;
  collided: boolean;
  finalPositionErrorM: number | null;
  finalYawErrorRad: number | null;
  success: boolean;
  logComplete: boolean;
}

export interface Episode {
  header: EpisodeHeader;
  steps: EpisodeStep[];
  footer: EpisodeFooter;
}
