import * as tf from "@tensorflow/tfjs";
import modelJson from "../../training/model/model.json";
import weightsUrl from "../../training/model/weights.bin?url";
import {
  observationToFeatures,
  labelToCommand,
} from "../../training/src/features";
import type { Scenario } from "../../engine/src/index";
import {
  POLICY_CHECKSUM,
  POLICY_VERSION,
  policySupportError,
  type LoadedPolicy,
} from "./policy-info";

// 작은 MLP는 CPU에서만 실행해 Three.js의 WebGL 문맥과 분리한다.
export async function loadPolicy(
  scenario: Scenario,
  signal: AbortSignal,
): Promise<LoadedPolicy> {
  const unsupported = policySupportError(scenario);
  if (unsupported) throw Error(unsupported);
  signal.throwIfAborted();
  const response = await fetch(weightsUrl, { signal });
  if (!response.ok) throw Error("학습 모델 파일을 불러오지 못했어요.");
  const weights = await response.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", weights)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== POLICY_CHECKSUM)
    throw Error("학습 모델 체크섬이 달라 실행을 중단했어요.");
  await tf.setBackend("cpu");
  await tf.ready();
  signal.throwIfAborted();
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest[0]
        .weights as tf.io.WeightsManifestEntry[],
      weightData: weights,
    }),
  );
  if (
    signal.aborted ||
    model.inputs[0].shape.at(-1) !== 41 ||
    model.outputs[0].shape.at(-1) !== 2
  ) {
    model.dispose();
    throw Error("모델 로딩이 취소됐거나 입출력 규격이 달라요.");
  }
  return {
    version: POLICY_VERSION,
    predict(observation) {
      const features = observationToFeatures(observation, scenario.vehicle);
      if (features.length !== 41 || !features.every(Number.isFinite))
        throw Error("정책 관측값이 유효하지 않아요.");
      const label = tf.tidy(() =>
        Array.from(
          (model.predict(tf.tensor2d([features])) as tf.Tensor).dataSync(),
        ),
      );
      if (
        label.length !== 2 ||
        !label.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)
      )
        throw Error("정책 출력이 유효하지 않아요.");
      return labelToCommand(label, scenario.vehicle);
    },
    dispose: () => model.dispose(),
  };
}
