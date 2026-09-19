// #17 (사용자 제안): 모든 존재 가능한 사용자 맵을 다 학습시키는 건 사실상 불가능하다 — 학습
// 안 한 배치(예: 사용자가 벽 하나만 추가한 커스텀 맵)에서는 정책이 완전히 틀린 판단을 할 수
// 있다. 실제로 확인된 증상: 정면에 장애물이 아주 가까운데도 속도를 안 줄이고 그대로 박아버림.
//
// "모든 맵에서 잘 주차하기"는 학습으로 풀어야 하는 어려운 문제지만, "적어도 눈앞의 장애물을
// 보고도 안 멈추는" 것만큼은 학습과 무관하게 규칙(rule)으로 막을 수 있다 — 실제 자동차의
// 긴급 자동제동(AEB)과 같은 개념. 학습된 정책이 뭐라고 하든, 어느 방향이든 정지거리보다 가까운
// 게 감지되면 무조건 정지 명령으로 덮어쓴다.
//
// (버그 수정) 처음엔 ray.rangeM(센서 장착점부터 거리)을 그대로 썼다가 실패했다 — 장착점은
// 차량 뒷축에서 1.3m 앞인데 앞범퍼는 3.5m 앞까지 나가 있어서, "정면 2m 남음"이 실제로는 이미
// 범퍼가 박은 상태를 의미할 수 있었다. sensorGap.ts로 차체 표면 기준 실제 여유 거리를 쓰도록
// 고쳤다(web/src/SensorAssist.tsx의 경고음 트리거와 같은 계산을 공유).
//
// (막은 뒤 문제) 그냥 속도를 0으로만 덮어쓰면, 다음 스텝에도 정책이 또 같은 방향을 시도해서
// 계속 막히기만 하고 그 자리에 영원히 멈춰버린다(새로운 종류의 "막힘"). 그래서 막히면 잠깐
// 반대 방향으로 물러나는 동작까지 추가했다(createEmergencyBrakeController) — 물러나는 동안도
// 같은 안전 검사를 그대로 적용해 뒤쪽도 막혀 있으면(끼임) 무리하게 후진하지 않는다.
//
// observation(센서+속도)만 쓰고 poseTruth는 전혀 안 쓴다 — 학습도 필요 없고 특권 정보도
// 없어서, 어떤 맵에서든 배포 그대로 바로 켤 수 있다(stuckRecoveryController.ts의 킥들과 달리
// #14 "같은 환경의 사람·정책 비교" 공정성 문제가 없다).
import { DEFAULT_MAX_ACCEL_MPS2, normalizeAngle, type Command, type Observation, type VehicleSpec } from "../../engine/src/index.js";
import { sensorGapM, type VehicleExtent } from "./sensorGap.js";

export interface EmergencyBrakeOptions {
  /** 정지거리 계산에 쓸 감속도(m/s^2). vehicle.maxAccelerationMps2가 있으면 그걸 우선한다. */
  decelerationMps2: number;
  /** 정지거리 계산값에 더할 안전 여유(m) — 센서 노이즈·반응 지연 대비. */
  marginM: number;
}

export const DEFAULT_EMERGENCY_BRAKE_OPTIONS: EmergencyBrakeOptions = {
  decelerationMps2: DEFAULT_MAX_ACCEL_MPS2,
  marginM: 0.15,
};

/** v^2 = 2*a*d 에서 유도한 제동거리 + 안전 여유. */
function stopDistanceM(speedMps: number, opts: EmergencyBrakeOptions): number {
  return (speedMps * speedMps) / (2 * opts.decelerationMps2) + opts.marginM;
}

/** coneHalfAngleRad가 없으면(기본) 전방향을, 있으면 facingRad 기준 그 각도 안의 ray만 본다. */
function minGapM(
  observation: Observation,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleExtent,
  facingRad = 0,
  coneHalfAngleRad = Math.PI
): number {
  let min = Infinity;
  for (const ray of observation.sensors) {
    if (!ray.valid) continue;
    if (Math.abs(normalizeAngle(ray.angleRad - facingRad)) > coneHalfAngleRad) continue;
    const gap = sensorGapM(ray, sensorPoseVehicle, vehicle);
    if (gap < min) min = gap;
  }
  return min;
}

/**
 * 정책이 낸 명령을 그대로 실행했을 때, 어느 방향이든(정면만이 아니라 360도 전부) 정지거리보다
 * 가까운 게(차체 표면 기준) 감지되면 속도를 0으로 덮어써서 반환한다(조향은 유지). 처음엔
 * "진행 방향(정면/후면)만" 봤는데, 실제로 회전 중 뒤쪽 모서리가 옆/뒤에서 먼저 닿는 경우
 * (꼬리 흔들림, tail swing)를 놓치는 걸 확인해서 전방향 검사로 바꿨다.
 */
export function applyEmergencyBrake(
  observation: Observation,
  command: Command,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleExtent,
  options: Partial<EmergencyBrakeOptions> = {}
): Command {
  const opts = { ...DEFAULT_EMERGENCY_BRAKE_OPTIONS, ...options };
  if (command.targetSpeedMps === 0) return command;

  const threshold = stopDistanceM(Math.abs(observation.speedMps), opts);
  const blocked = minGapM(observation, sensorPoseVehicle, vehicle) < threshold;

  if (!blocked) return command;
  return { targetSpeedMps: 0, targetSteeringRad: command.targetSteeringRad };
}

/** createLearnedController 등 기존 (observation)=>Command 정책을 그대로 감싼다(멈추기만, 후속 행동 없음). */
export function wrapWithEmergencyBrake(
  policy: (observation: Observation) => Command,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleExtent,
  options: Partial<EmergencyBrakeOptions> = {}
): (observation: Observation) => Command {
  return (observation) => applyEmergencyBrake(observation, policy(observation), sensorPoseVehicle, vehicle, options);
}

export interface EmergencyRecoveryOptions extends EmergencyBrakeOptions {
  /** 막혔을 때 반대 방향으로 물러날 속도(최대 속도 대비 비율). */
  backupSpeedScale: number;
  /** 반대 방향으로 물러나는 스텝 수. */
  backupSteps: number;
}

export const DEFAULT_EMERGENCY_RECOVERY_OPTIONS: EmergencyRecoveryOptions = {
  ...DEFAULT_EMERGENCY_BRAKE_OPTIONS,
  backupSpeedScale: 0.3,
  backupSteps: 15,
};

/**
 * wrapWithEmergencyBrake + "막히면 반대 방향으로 잠깐 물러난 뒤 정책에게 다시 맡긴다"를
 * 더한 버전 — 멈추기만 하면 다음 스텝에도 정책이 같은 방향을 또 시도해 그 자리에 영원히
 * 멈춰버리는 문제를 막는다. 물러나는 중에도 같은 안전 검사를 적용해서(끼인 상황이면) 무리하게
 * 후진하지 않는다.
 */
export function createEmergencyBrakeController(
  policy: (observation: Observation) => Command,
  sensorPoseVehicle: { xM: number; yM: number },
  vehicle: VehicleSpec,
  options: Partial<EmergencyRecoveryOptions> = {}
): (observation: Observation) => Command {
  const opts = { ...DEFAULT_EMERGENCY_RECOVERY_OPTIONS, ...options };
  let backupStepsLeft = 0;
  let backupSign = 1;

  return (observation: Observation): Command => {
    if (backupStepsLeft > 0) {
      backupStepsLeft--;
      const speedLimit = backupSign > 0 ? vehicle.maxForwardSpeedMps : vehicle.maxReverseSpeedMps;
      const backupCommand: Command = { targetSpeedMps: backupSign * speedLimit * opts.backupSpeedScale, targetSteeringRad: 0 };
      // 물러나는 방향(backupSign)의 넓은 반원(전방향 검사를 그대로 쓰면 "방금 그 자리에 있던
      // 앞쪽 장애물" 때문에 후진 시도까지 매번 다시 막혀버린다 — 물러나는 쪽만 확인한다.
      const facingRad = backupSign > 0 ? 0 : Math.PI;
      const threshold = stopDistanceM(Math.abs(observation.speedMps), opts);
      const blocked = minGapM(observation, sensorPoseVehicle, vehicle, facingRad, Math.PI / 2) < threshold;
      return blocked ? { targetSpeedMps: 0, targetSteeringRad: 0 } : backupCommand;
    }

    const command = policy(observation);
    const guarded = applyEmergencyBrake(observation, command, sensorPoseVehicle, vehicle, opts);
    if (guarded.targetSpeedMps !== command.targetSpeedMps) {
      backupSign = command.targetSpeedMps > 0 ? -1 : 1; // 막힌 방향과 반대로
      backupStepsLeft = opts.backupSteps;
    }
    return guarded;
  };
}

/** vehicle.maxAccelerationMps2가 지정돼 있으면 기본 감속도 대신 그 값을 쓴다. */
export function emergencyBrakeOptionsForVehicle(
  vehicle: VehicleSpec,
  overrides: Partial<EmergencyBrakeOptions> = {}
): Partial<EmergencyBrakeOptions> {
  return { decelerationMps2: vehicle.maxAccelerationMps2 ?? DEFAULT_MAX_ACCEL_MPS2, ...overrides };
}
