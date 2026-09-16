// 작은 행동복제(behavior cloning) MLP. docs/data-learning.md의 "작은 행동복제 baseline"에 해당.
import * as tf from "@tensorflow/tfjs";
import { FEATURE_SIZE, LABEL_SIZE } from "./features.js";

export function buildModel(): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_SIZE], units: 32, activation: "relu" }));
  model.add(tf.layers.dense({ units: 16, activation: "relu" }));
  model.add(tf.layers.dense({ units: LABEL_SIZE, activation: "tanh" })); // 출력은 [-1,1] 정규화값
  model.compile({ optimizer: tf.train.adam(0.005), loss: "meanSquaredError" });
  return model;
}
