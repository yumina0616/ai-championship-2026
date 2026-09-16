import manifest from "../../training/model/model-manifest.json" with { type: "json" };
import fixture from "../../examples/scenarios/parkside-open.v1.json" with { type: "json" };
import {
  loadScenarioFromJson,
  type Scenario,
  type ScenarioJson,
  type Command,
  type Observation,
} from "../../engine/src/index";

export const POLICY_VERSION = `${manifest.policyVersion}@${manifest.artifactChecksumSha256}`;
export const POLICY_LABEL = `${manifest.policyVersion} · ${manifest.artifactChecksumSha256.slice(0, 8)}`;
export const POLICY_CHECKSUM = manifest.artifactChecksumSha256;
export interface LoadedPolicy {
  version: string;
  predict: (observation: Observation) => Command;
  dispose: () => void;
}
const reference = loadScenarioFromJson(fixture as ScenarioJson);
export function policySupportError(s: Scenario): string | null {
  for (const key of Object.keys(
    reference.vehicle,
  ) as (keyof Scenario["vehicle"])[]) {
    if (s.vehicle[key] !== reference.vehicle[key])
      return "이 모델이 지원하지 않는 차량 제원이에요.";
  }
  if (
    (s.vehicle.maxAccelerationMps2 ?? 2) !== 2 ||
    (s.vehicle.maxSteeringRateRadPerS ?? 1.5) !== 1.5
  )
    return "이 모델이 지원하지 않는 차량 변화율이에요.";
  const a = s.sensor,
    b = reference.sensor;
  if (
    !a ||
    !b ||
    a.rayCount !== b.rayCount ||
    a.maxRangeM !== b.maxRangeM ||
    a.angleMinRad !== b.angleMinRad ||
    a.angleIncrementRad !== b.angleIncrementRad ||
    a.periodS !== b.periodS ||
    a.noiseStdM !== b.noiseStdM ||
    a.poseVehicle.xM !== b.poseVehicle.xM ||
    a.poseVehicle.yM !== b.poseVehicle.yM ||
    a.poseVehicle.yawRad !== b.poseVehicle.yawRad
  )
    return "이 모델은 지정된 무잡음 36-ray 센서 배치만 지원해요.";
  return null;
}
