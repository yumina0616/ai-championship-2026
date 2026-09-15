import type { Command, VehicleSpec } from "../../engine/src/index";

export type Gear = "P" | "R" | "D";
export type DriverInput = "throttle" | "brake" | "left" | "right";
export const STOP_SPEED = 0.001;
export function keyInput(code: string, gear: Gear): DriverInput | null {
  if (code === "ArrowUp") return gear === "R" ? "brake" : "throttle";
  if (code === "ArrowDown") return gear === "R" ? "throttle" : "brake";
  return (
    (
      {
        KeyW: "throttle",
        KeyS: "brake",
        KeyA: "left",
        ArrowLeft: "left",
        KeyD: "right",
        ArrowRight: "right",
      } as Record<string, DriverInput>
    )[code] ?? null
  );
}
export function canShift(speedMps: number) {
  return Number.isFinite(speedMps) && Math.abs(speedMps) <= STOP_SPEED;
}

// #8: 페달/기어는 기존 signed-speed command로 변환합니다. 변속기/타이어 물리를 새로 만들지 않습니다.
// ponytail: 키보드 페달은 0/1 입력입니다. 아날로그 장치를 지원할 때 압력 축으로 확장합니다.
export function driverCommand(
  gear: Gear,
  inputs: ReadonlySet<DriverInput>,
  previous: Command,
  vehicle: VehicleSpec,
  dt: number,
  analogSteer: number | null = null,
): Command {
  const brake = inputs.has("brake");
  const limit =
    gear === "R" ? vehicle.maxReverseSpeedMps : vehicle.maxForwardSpeedMps;
  const acceleration =
    gear === "P" || brake ? -2 : inputs.has("throttle") ? 0.8 : -0.25;
  const magnitude =
    gear === "P"
      ? 0
      : Math.min(
          limit,
          Math.max(0, Math.abs(previous.targetSpeedMps) + acceleration * dt),
        );
  const direction = Number(inputs.has("left")) - Number(inputs.has("right"));
  const steer = previous.targetSteeringRad;
  const nextSteer =
    analogSteer !== null && Number.isFinite(analogSteer)
      ? Math.max(-1, Math.min(1, analogSteer)) * vehicle.maxSteeringRad
      : direction
        ? steer + direction * 0.75 * dt
        : Math.sign(steer) * Math.max(0, Math.abs(steer) - 0.45 * dt);
  return {
    targetSpeedMps: (gear === "R" ? -1 : 1) * magnitude,
    targetSteeringRad: Math.max(
      -vehicle.maxSteeringRad,
      Math.min(vehicle.maxSteeringRad, nextSteer),
    ),
  };
}
