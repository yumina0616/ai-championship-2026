// 학습된 tfjs 모델을 engine.ts가 원하는 Command 생성 함수로 감싼다.
// 입력은 Observation(센서+속도/조향각+목표 상대좌표)뿐이다 — poseTruth/goalPose 직접 접근 없음
// (baselineController.ts/hybridAStar.ts와 달리 policy_kind="learned"는 truth를 안 쓴다).
import * as tf from "@tensorflow/tfjs";
import type { Command, Observation, VehicleSpec } from "../../engine/src/index.js";
import { labelToCommand, observationToFeatures } from "./features.js";

export function createLearnedController(model: tf.LayersModel, vehicle: VehicleSpec) {
  return (observation: Observation): Command => {
    const features = observationToFeatures(observation, vehicle);
    const output = model.predict(tf.tensor2d([features])) as tf.Tensor;
    const label = output.dataSync();
    output.dispose();
    return labelToCommand(Array.from(label), vehicle);
  };
}
