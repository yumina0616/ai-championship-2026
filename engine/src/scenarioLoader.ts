// examples/scenarios/*.json(snake_case)을 engine 내부 Scenario 타입(camelCase)으로 변환한다.
// #3에서 만든 fixture를 실제로 엔진에 흘려서 계약 문서와 구현이 일치하는지 증명하는 용도.
import type { RectObstacle, Scenario, VehicleSpec, WorldBounds } from "./types.js";

export interface ScenarioJson {
  scenario_id: string;
  vehicle: {
    wheelbase_m: number;
    front_overhang_m: number;
    rear_overhang_m: number;
    width_m: number;
    max_forward_speed_mps: number;
    max_reverse_speed_mps: number;
    max_steering_rad: number;
  };
  world: { bounds: { min_x: number; max_x: number; min_y: number; max_y: number } };
  start: { x_m: number; y_m: number; yaw_rad: number };
  obstacles: Array<{
    id: string;
    center_x_m: number;
    center_y_m: number;
    length_m: number;
    width_m: number;
    yaw_rad: number;
  }>;
  evaluation: { timeout_sim_s: number };
}

export function loadScenarioFromJson(json: ScenarioJson): Scenario {
  const vehicle: VehicleSpec = {
    wheelbaseM: json.vehicle.wheelbase_m,
    frontOverhangM: json.vehicle.front_overhang_m,
    rearOverhangM: json.vehicle.rear_overhang_m,
    widthM: json.vehicle.width_m,
    maxForwardSpeedMps: json.vehicle.max_forward_speed_mps,
    maxReverseSpeedMps: json.vehicle.max_reverse_speed_mps,
    maxSteeringRad: json.vehicle.max_steering_rad,
  };
  const bounds: WorldBounds = {
    minX: json.world.bounds.min_x,
    maxX: json.world.bounds.max_x,
    minY: json.world.bounds.min_y,
    maxY: json.world.bounds.max_y,
  };
  const obstacles: RectObstacle[] = json.obstacles.map((o) => ({
    id: o.id,
    centerXM: o.center_x_m,
    centerYM: o.center_y_m,
    lengthM: o.length_m,
    widthM: o.width_m,
    yawRad: o.yaw_rad,
  }));
  return {
    scenarioId: json.scenario_id,
    vehicle,
    bounds,
    start: { xM: json.start.x_m, yM: json.start.y_m, yawRad: json.start.yaw_rad },
    obstacles,
    timeoutSimS: json.evaluation.timeout_sim_s,
  };
}
