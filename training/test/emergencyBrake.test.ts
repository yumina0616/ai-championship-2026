import { describe, expect, it } from "vitest";
import {
  applyEmergencyBrake,
  wrapWithEmergencyBrake,
  createEmergencyBrakeController,
  DEFAULT_EMERGENCY_BRAKE_OPTIONS,
  DEFAULT_EMERGENCY_RECOVERY_OPTIONS,
} from "../src/emergencyBrake";
import type { Command, Observation, RangeReading, VehicleSpec } from "../../engine/src/index";

const SENSOR_MOUNT = { xM: 1.3, yM: 0 }; // 실제 시나리오 공통값(뒷축에서 1.3m 앞)
const VEHICLE: VehicleSpec = {
  wheelbaseM: 2.6,
  frontOverhangM: 0.9,
  rearOverhangM: 0.9,
  widthM: 1.8,
  maxForwardSpeedMps: 1.5,
  maxReverseSpeedMps: 1,
  maxSteeringRad: 0.55,
};
// 앞범퍼는 뒷축에서 wheelbase+frontOverhang = 3.5m, 장착점(1.3m)에서는 2.2m 더 나가있다.
const BUMPER_BEYOND_MOUNT_M = VEHICLE.wheelbaseM + VEHICLE.frontOverhangM - SENSOR_MOUNT.xM;

function ray(angleRad: number, rangeM: number, valid = true): RangeReading {
  return { angleRad, rangeM, valid, updatedSimTimeS: 0 };
}
function obs(speedMps: number, sensors: RangeReading[]): Observation {
  return { sensors, speedMps, steeringRad: 0, goalRelative: { xM: 5, yM: 0, yawRad: 0 } };
}
const FORWARD: Command = { targetSpeedMps: 0.8, targetSteeringRad: 0.2 };
const BACKWARD: Command = { targetSpeedMps: -0.6, targetSteeringRad: -0.1 };

describe("applyEmergencyBrake", () => {
  it("정면 ray의 원시값이 범퍼 돌출 거리보다도 짧으면(이미 범퍼가 닿거나 넘어선 상태) 속도를 0으로 덮어쓴다", () => {
    const observation = obs(0.8, [ray(0, BUMPER_BEYOND_MOUNT_M - 0.05)]);
    const result = applyEmergencyBrake(observation, FORWARD, SENSOR_MOUNT, VEHICLE);
    expect(result.targetSpeedMps).toBe(0);
    expect(result.targetSteeringRad).toBe(FORWARD.targetSteeringRad);
  });

  it("원시 ray값이 범퍼 돌출 거리보다 커도, 차체 표면 기준 여유가 정지거리 안이면 제동한다(핵심 버그 재발 방지)", () => {
    // 원시값 2m는 얼핏 안전해 보이지만, 범퍼가 이미 2.2m를 차지하므로 실제 여유는 -0.2m(이미 접촉).
    const observation = obs(0.8, [ray(0, 2.0)]);
    const result = applyEmergencyBrake(observation, FORWARD, SENSOR_MOUNT, VEHICLE);
    expect(result.targetSpeedMps).toBe(0);
  });

  it("차체 표면 기준으로도 충분히 열려 있으면 원래 명령을 그대로 돌려준다", () => {
    const observation = obs(0.8, [ray(0, BUMPER_BEYOND_MOUNT_M + 10)]);
    const result = applyEmergencyBrake(observation, FORWARD, SENSOR_MOUNT, VEHICLE);
    expect(result).toEqual(FORWARD);
  });

  it("진행 방향과 무관하게(측면/후면도) 가까운 게 있으면 제동한다 — 회전 중 뒤쪽 모서리가 옆에서 먼저 닿는 경우(tail swing)", () => {
    const sideClose = obs(0.8, [ray(Math.PI / 2, 0.1)]);
    expect(applyEmergencyBrake(sideClose, FORWARD, SENSOR_MOUNT, VEHICLE).targetSpeedMps).toBe(0);

    const rearClose = obs(0.6, [ray(Math.PI, VEHICLE.rearOverhangM + 0.05)]);
    expect(applyEmergencyBrake(rearClose, BACKWARD, SENSOR_MOUNT, VEHICLE).targetSpeedMps).toBe(0);
  });

  it("정지 상태(속도 0)에서는 아무리 가까이 있어도 개입하지 않는다", () => {
    const observation = obs(0, [ray(0, 0.05)]);
    const stopped: Command = { targetSpeedMps: 0, targetSteeringRad: 0.3 };
    expect(applyEmergencyBrake(observation, stopped, SENSOR_MOUNT, VEHICLE)).toEqual(stopped);
  });

  it("결측(valid:false) ray는 판단에서 제외한다", () => {
    const observation = obs(0.8, [ray(0, 0.05, false)]);
    const result = applyEmergencyBrake(observation, FORWARD, SENSOR_MOUNT, VEHICLE);
    expect(result).toEqual(FORWARD);
  });

  it("wrapWithEmergencyBrake는 정책 출력에 그대로 안전장치를 씌운다", () => {
    const dangerousPolicy = () => FORWARD;
    const wrapped = wrapWithEmergencyBrake(dangerousPolicy, SENSOR_MOUNT, VEHICLE);
    const result = wrapped(obs(0.8, [ray(0, 0.05)]));
    expect(result.targetSpeedMps).toBe(0);
  });

  it("기본 옵션값이 합리적인 범위다", () => {
    expect(DEFAULT_EMERGENCY_BRAKE_OPTIONS.decelerationMps2).toBeGreaterThan(0);
    expect(DEFAULT_EMERGENCY_BRAKE_OPTIONS.marginM).toBeGreaterThan(0);
  });
});

describe("createEmergencyBrakeController", () => {
  it("전진이 막히면 몇 스텝 동안 반대 방향(후진)으로 물러난 뒤 다시 정책에게 맡긴다", () => {
    let policyCalls = 0;
    const policy = () => {
      policyCalls++;
      return FORWARD;
    };
    const controller = createEmergencyBrakeController(policy, SENSOR_MOUNT, VEHICLE, { backupSteps: 3 });
    // 앞뒤 다 막힌(끼인) 상황 — 후진도 안전하지 않아야 한다.
    const pinnedObs = obs(0.8, [ray(0, 0.1), ray(Math.PI, VEHICLE.rearOverhangM + 0.05)]);
    const results: Command[] = [];
    for (let i = 0; i < 4; i++) results.push(controller(pinnedObs)); // 1(트리거) + backupSteps(3)

    // 1번째 호출: policy 부름(FORWARD) -> 막혀서 0으로 덮이고 backup 예약.
    expect(results[0]!.targetSpeedMps).toBe(0);
    // 2~4번째: backup을 시도하지만 뒤쪽도 막혀 있어서 역시 0(끼인 상태에서 무리하게 후진 안 함).
    expect(results[1]!.targetSpeedMps).toBe(0);
    expect(results[2]!.targetSpeedMps).toBe(0);
    expect(results[3]!.targetSpeedMps).toBe(0);
    // backup 큐 소비 중엔 policy를 다시 안 부른다(1번만 호출됐어야 함).
    expect(policyCalls).toBe(1);
  });

  it("막힌 뒤 물러날 공간이 있으면 실제로 반대 방향 속도로 후진한다", () => {
    const policy = () => FORWARD;
    const controller = createEmergencyBrakeController(policy, SENSOR_MOUNT, VEHICLE, { backupSteps: 3, backupSpeedScale: 0.5 });
    // 첫 호출: 정면이 막혀서 0 + backup 예약.
    controller(obs(0.8, [ray(0, 0.1)]));
    // 두번째 호출부턴 사방이 열린 관측을 줘서, backup 시도가 안전 검사를 통과하는지 본다.
    const openObs = obs(0.3, [ray(0, 100)]);
    const backing = controller(openObs);
    expect(backing.targetSpeedMps).toBeLessThan(0); // 후진 방향
    expect(backing.targetSpeedMps).toBeCloseTo(-VEHICLE.maxReverseSpeedMps * 0.5, 6);
  });

  it("기본 옵션값이 합리적인 범위다", () => {
    expect(DEFAULT_EMERGENCY_RECOVERY_OPTIONS.backupSpeedScale).toBeGreaterThan(0);
    expect(DEFAULT_EMERGENCY_RECOVERY_OPTIONS.backupSpeedScale).toBeLessThanOrEqual(1);
    expect(DEFAULT_EMERGENCY_RECOVERY_OPTIONS.backupSteps).toBeGreaterThan(0);
  });
});
