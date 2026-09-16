// 작은 행동복제(behavior cloning) MLP. docs/data-learning.md의 "작은 행동복제 baseline"에 해당.
import * as tf from "@tensorflow/tfjs";
import { FEATURE_SIZE, LABEL_SIZE } from "./features.js";

/**
 * seed는 각 layer의 kernel 초기화(glorotUniform)에 직접 전달한다 — tfjs에는 Python TF처럼
 * 전역 tf.random.set_seed()가 없어서, 이렇게 하지 않으면 seed를 manifest에 적어도 실제
 * 가중치 초기화는 매번 달라진다(리뷰에서 지적됨: buildModel()을 두 번 부르면 가중치가 달랐음).
 * bias는 기본값(zeros)이라 원래도 결정론적이다.
 */
export function buildModel(seed: number): tf.LayersModel {
  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      inputShape: [FEATURE_SIZE],
      units: 32,
      activation: "relu",
      kernelInitializer: tf.initializers.glorotUniform({ seed }),
    })
  );
  model.add(
    tf.layers.dense({
      units: 16,
      activation: "relu",
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }),
    })
  );
  model.add(
    tf.layers.dense({
      units: LABEL_SIZE,
      activation: "tanh", // 출력은 [-1,1] 정규화값
      kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 2 }),
    })
  );
  model.compile({ optimizer: tf.train.adam(0.005), loss: "meanSquaredError" });
  return model;
}
