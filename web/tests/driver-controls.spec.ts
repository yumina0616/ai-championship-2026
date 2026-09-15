import { test, expect } from "@playwright/test";
import { driverCommand, canShift, keyInput } from "../src/driver-controls";
import { makeScenario } from "../src/driving";
const vehicle = makeScenario("open").vehicle;
const zero = { targetSpeedMps: 0, targetSteeringRad: 0 };
test("방향키 액셀은 D ↑ / R ↓, 반대 방향키는 제동이며 W/S는 고정", () => {
  expect(keyInput("ArrowUp", "D")).toBe("throttle");
  expect(keyInput("ArrowDown", "D")).toBe("brake");
  expect(keyInput("ArrowDown", "R")).toBe("throttle");
  expect(keyInput("ArrowUp", "R")).toBe("brake");
  for (const gear of ["P", "D", "R"] as const) {
    expect(keyInput("KeyW", gear)).toBe("throttle");
    expect(keyInput("KeyS", gear)).toBe("brake");
  }
  expect(keyInput("KeyZ", "D")).toBeNull();
});
test("드래그 조향 축은 각도 제한을 지키고 해제하면 중앙 복원", () => {
  const command = driverCommand("D", new Set(), zero, vehicle, 0.05, 5);
  expect(command.targetSteeringRad).toBe(vehicle.maxSteeringRad);
  expect(
    driverCommand("D", new Set(), command, vehicle, 0.05, null)
      .targetSteeringRad,
  ).toBeLessThan(command.targetSteeringRad);
  expect(
    driverCommand("D", new Set(), zero, vehicle, 0.05, NaN).targetSteeringRad,
  ).toBe(0);
});
test("P에서는 액셀 무효, D/R은 같은 액셀로 부호만 변경", () => {
  expect(
    driverCommand("P", new Set(["throttle"]), zero, vehicle, 0.05)
      .targetSpeedMps,
  ).toBe(0);
  expect(
    driverCommand("D", new Set(["throttle"]), zero, vehicle, 0.05)
      .targetSpeedMps,
  ).toBeGreaterThan(0);
  expect(
    driverCommand("R", new Set(["throttle"]), zero, vehicle, 0.05)
      .targetSpeedMps,
  ).toBeLessThan(0);
});
test("브레이크 우선·반대 방향으로 넘어가지 않음·관성 감속", () => {
  const previous = { ...zero, targetSpeedMps: 0.04 };
  expect(
    driverCommand("D", new Set(["throttle", "brake"]), previous, vehicle, 0.05)
      .targetSpeedMps,
  ).toBe(0);
  expect(
    Math.abs(
      driverCommand(
        "R",
        new Set(["brake"]),
        { ...zero, targetSpeedMps: -0.04 },
        vehicle,
        0.05,
      ).targetSpeedMps,
    ),
  ).toBe(0);
  expect(
    driverCommand("D", new Set(), { ...zero, targetSpeedMps: 1 }, vehicle, 0.05)
      .targetSpeedMps,
  ).toBeGreaterThan(
    driverCommand(
      "D",
      new Set(["brake"]),
      { ...zero, targetSpeedMps: 1 },
      vehicle,
      0.05,
    ).targetSpeedMps,
  );
});
test("변속 정지 경계·비정상 속도 거부", () => {
  expect(canShift(0)).toBe(true);
  expect(canShift(0.03)).toBe(false);
  expect(canShift(-0.03)).toBe(false);
  expect(canShift(NaN)).toBe(false);
});
test("조향 점진 증가·속도 및 각도 제한·복원 보조", () => {
  const left = driverCommand("D", new Set(["left"]), zero, vehicle, 0.05);
  expect(left.targetSteeringRad).toBeGreaterThan(0);
  expect(left.targetSteeringRad).toBeLessThan(vehicle.maxSteeringRad);
  const center = driverCommand("D", new Set(), left, vehicle, 0.05);
  expect(center.targetSteeringRad).toBeLessThan(left.targetSteeringRad);
  expect(center.targetSteeringRad).toBeGreaterThanOrEqual(0);
  const capped = driverCommand(
    "D",
    new Set(["left", "throttle"]),
    {
      targetSpeedMps: vehicle.maxForwardSpeedMps,
      targetSteeringRad: vehicle.maxSteeringRad,
    },
    vehicle,
    0.05,
  );
  expect(capped.targetSteeringRad).toBe(vehicle.maxSteeringRad);
  expect(capped.targetSpeedMps).toBe(vehicle.maxForwardSpeedMps);
});
