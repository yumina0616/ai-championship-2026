import type { Scenario } from "../../engine/src/index";
export type TemplateId = "open" | "neighbors" | "pillar";

// 렌더링과 물리가 공유하는 프리셋. UI 좌표는 (x, 높이, -y), pose는 뒷차축 기준입니다.
export function makeScenario(template: TemplateId): Scenario {
  const parked = [-6, 6, ...(template === "open" ? [] : [-3, 3])].map((x) => ({
    id: "parked-" + x,
    centerXM: x,
    centerYM: 1.55,
    lengthM: 4.4,
    widthM: 1.8,
    yawRad: -Math.PI / 2,
  }));
  return {
    scenarioId: "parkside-" + template + "-v2",
    layoutGroup: template,
    seed: 42,
    vehicle: {
      wheelbaseM: 2.6,
      frontOverhangM: 0.9,
      rearOverhangM: 0.9,
      widthM: 1.8,
      maxForwardSpeedMps: 1.5,
      maxReverseSpeedMps: 1,
      maxSteeringRad: 0.55,
    },
    bounds: { minX: -8.2, maxX: 8.2, minY: -6.05, maxY: 4.35 },
    start: { xM: 0.2, yM: -3.7, yawRad: 0 },
    obstacles: [
      ...parked,
      ...(template === "pillar"
        ? [
            {
              id: "pillar",
              centerXM: 1.63,
              centerYM: -0.38,
              lengthM: 0.6,
              widthM: 0.6,
              yawRad: 0,
            },
          ]
        : []),
    ],
    timeoutSimS: 90,
    sensor: {
      id: "primary",
      poseVehicle: { xM: 1.3, yM: 0, yawRad: 0 },
      rayCount: 36,
      angleMinRad: -Math.PI,
      angleIncrementRad: Math.PI / 18,
      maxRangeM: 10,
      periodS: 0.05,
      noiseStdM: 0,
    },
    goalPose: { xM: 0, yM: 2.9, yawRad: -Math.PI / 2 },
    goalSpace: {
      centerXM: 0,
      centerYM: 1.6,
      lengthM: 5.4,
      widthM: 2.8,
      yawRad: -Math.PI / 2,
    },
    successCriteria: {
      positionToleranceM: 0.6,
      yawToleranceRad: 0.0872665,
      stoppedSpeedMps: 0.05,
      holdTimeS: 1,
      requireFootprintInsideGoal: true,
      collisionTerminates: true,
    },
  };
}
