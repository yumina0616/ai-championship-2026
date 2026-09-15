// examples/scenarios/*.json(snake_case)을 engine 내부 Scenario 타입(camelCase)으로 변환한다.
// #3에서 만든 fixture를 실제로 엔진에 흘려서 계약 문서와 구현이 일치하는지 증명하는 용도.
import type { RectObstacle, Scenario, SensorSpec, VehicleSpec, WorldBounds } from "./types.js";

export interface ScenarioJson {
  scenario_id: string;
  seed?: number;
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
  goal: {
    pose: { x_m: number; y_m: number; yaw_rad: number };
    space: {
      center_x_m: number;
      center_y_m: number;
      length_m: number;
      width_m: number;
      yaw_rad: number;
    };
  };
  obstacles: Array<{
    id: string;
    center_x_m: number;
    center_y_m: number;
    length_m: number;
    width_m: number;
    yaw_rad: number;
  }>;
  sensor: {
    pose_vehicle: { x_m: number; y_m: number; yaw_rad: number };
    ray_count: number;
    angle_min_rad: number;
    angle_increment_rad: number;
    max_range_m: number;
    period_s: number;
    noise_std_m: number;
  };
  evaluation: {
    timeout_sim_s: number;
    position_tolerance_m: number;
    yaw_tolerance_rad: number;
    stopped_speed_mps: number;
    hold_time_s: number;
    require_footprint_inside_goal: boolean;
    collision_terminates: boolean;
  };
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
  const sensor: SensorSpec = {
    id: "primary",
    poseVehicle: {
      xM: json.sensor.pose_vehicle.x_m,
      yM: json.sensor.pose_vehicle.y_m,
      yawRad: json.sensor.pose_vehicle.yaw_rad,
    },
    rayCount: json.sensor.ray_count,
    angleMinRad: json.sensor.angle_min_rad,
    angleIncrementRad: json.sensor.angle_increment_rad,
    maxRangeM: json.sensor.max_range_m,
    periodS: json.sensor.period_s,
    noiseStdM: json.sensor.noise_std_m,
  };
  return {
    scenarioId: json.scenario_id,
    vehicle,
    bounds,
    start: { xM: json.start.x_m, yM: json.start.y_m, yawRad: json.start.yaw_rad },
    obstacles,
    timeoutSimS: json.evaluation.timeout_sim_s,
    sensor,
    goalPose: {
      xM: json.goal.pose.x_m,
      yM: json.goal.pose.y_m,
      yawRad: json.goal.pose.yaw_rad,
    },
    goalSpace: {
      centerXM: json.goal.space.center_x_m,
      centerYM: json.goal.space.center_y_m,
      lengthM: json.goal.space.length_m,
      widthM: json.goal.space.width_m,
      yawRad: json.goal.space.yaw_rad,
    },
    successCriteria: {
      positionToleranceM: json.evaluation.position_tolerance_m,
      yawToleranceRad: json.evaluation.yaw_tolerance_rad,
      stoppedSpeedMps: json.evaluation.stopped_speed_mps,
      holdTimeS: json.evaluation.hold_time_s,
      requireFootprintInsideGoal: json.evaluation.require_footprint_inside_goal,
      collisionTerminates: json.evaluation.collision_terminates,
    },
    seed: json.seed,
  };
}
