import { test, expect } from "@playwright/test";
import { sensorFeedback, warningPeriod } from "../src/SensorAssist";
import { makeScenario, reverseGuide } from "../src/driving";
import {
  ParkingEngine,
  type RangeReading,
  type StepResult,
} from "../../engine/src/index";
const scenario = makeScenario("open");
function result(sensors: RangeReading[]): StepResult {
  return {
    observation: {
      sensors,
      speedMps: 0,
      steeringRad: 0,
      goalRelative: scenario.goalPose,
    },
    poseTruth: scenario.start,
    simTimeS: 1,
    appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 },
    outcome: { terminated: false, reason: null },
  };
}
const ray = (angleRad: number, rangeM: number): RangeReading => ({
  angleRad,
  rangeM,
  valid: true,
  updatedSimTimeS: 1,
});
test("센서 광선 차체 여유는 전후측 형상과 실제 원시 거리를 구분", () => {
  const f = sensorFeedback(
    result([ray(0, 2.7), ray(Math.PI, 2.4), ray(Math.PI / 2, 1.2)]),
    scenario,
  );
  expect(f.sectors[0].gap).toBeCloseTo(0.5);
  expect(f.sectors[1].gap).toBeCloseTo(0.3);
  expect(f.sectors[2].gap).toBeCloseTo(0.2);
  expect(f.rawMinimum).toBe(1.2);
  expect(f.nearest).toBeCloseTo(0.2);
  expect(f.sectors[3].valid).toBe(0);
});
test("미검출·결측·오래된 측정·비정상 값은 허위 0m 경고를 만들지 않음", () => {
  const f = sensorFeedback(
    result([
      ray(0, 10),
      { ...ray(Math.PI / 2, NaN), valid: false },
      { ...ray(Math.PI, 2.5), updatedSimTimeS: 0 },
      { ...ray(Math.PI, 2.5), updatedSimTimeS: NaN },
      ray(NaN, 1),
    ]),
    scenario,
  );
  expect(f.sectors[0].valid).toBe(1);
  expect(f.sectors[0].gap).toBeNull();
  expect(f.sectors[1].valid).toBe(0);
  expect(f.sectors[2].valid).toBe(0);
  expect(f.nearest).toBeNull();
  expect(f.detected).toBe(0);
  expect(warningPeriod(f.nearest)).toBeNull();
  expect(warningPeriod(NaN)).toBeNull();
  expect(warningPeriod(0.2)).toBeLessThan(warningPeriod(0.6)!);
  expect(warningPeriod(0.6)).toBeLessThan(warningPeriod(1.2)!);
  expect(warningPeriod(2)).toBeNull();
});
test("실제 센서 기반 피드백과 후진 연장선은 환경/조향 변화에 반응", () => {
  const s = makeScenario("open");
  s.obstacles = [
    {
      id: "front",
      centerXM: 5,
      centerYM: -3.7,
      lengthM: 0.2,
      widthM: 4,
      yawRad: 0,
    },
  ];
  const engine = new ParkingEngine();
  const observation = engine.reset(s);
  const initial = {
    ...result(observation.sensors),
    observation,
    poseTruth: s.start,
    simTimeS: 0,
  };
  const first = sensorFeedback(initial, s).nearest;
  const second = sensorFeedback(
    engine.step({ targetSpeedMps: 0.5, targetSteeringRad: 0 }),
    s,
  ).nearest;
  expect(second).toBeLessThan(first!);
  const straight = reverseGuide(s.start, 0, s),
    turned = reverseGuide(s.start, 0.4, s);
  expect(straight[0]).toHaveLength(33);
  expect(straight[0][32][0]).toBeLessThan(straight[0][0][0]);
  expect(turned[0][32][2]).not.toBeCloseTo(straight[0][32][2]);
});
