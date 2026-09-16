// 학습된 tfjs 모델을 engine.ts가 원하는 Command 생성 함수로 감싼다.
// 입력은 Observation(센서+속도/조향각+목표 상대좌표)뿐이다 — poseTruth/goalPose 직접 접근 없음
// (baselineController.ts/hybridAStar.ts와 달리 policy_kind="learned"는 truth를 안 쓴다).
import * as tf from "@tensorflow/tfjs";
import type { Command, Observation, VehicleSpec } from "../../engine/src/index.js";
import { labelToCommand, observationToFeatures } from "./features.js";

export function createLearnedController(model: tf.LayersModel, vehicle: VehicleSpec) {
  return (observation: Observation): Command => {
    const features = observationToFeatures(observation, vehicle);
    // tf.tidy는 콜백이 반환하는 tensor만 남기고 그 안에서 만든 나머지를 전부 dispose한다.
    // 여기서는 tensor가 아니라 일반 객체(Command)를 반환하므로 입력/출력 tensor 둘 다 정리된다.
    // 이전 버전은 output만 dispose하고 입력 tensor(tf.tensor2d)는 안 지워서 누적됐다(리뷰에서 지적됨:
    // 같은 관측으로 200회 추론 시 tf.memory().numTensors가 6→206으로 증가).
    const label = tf.tidy(() => {
      const output = model.predict(tf.tensor2d([features])) as tf.Tensor;
      return Array.from(output.dataSync());
    });
    return labelToCommand(label, vehicle);
  };
}
