// #11: train.json(+validation.json)으로 작은 MLP를 행동복제 학습시키고 모델을 저장한다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as tf from "@tensorflow/tfjs";
import { buildModel } from "./model.js";
import { saveModelToDisk } from "./modelIO.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = `${HERE}../data`;
const MODEL_DIR = `${HERE}../model`;

interface Sample {
  features: number[];
  label: number[];
}

function toTensors(samples: Sample[]): { xs: tf.Tensor2D; ys: tf.Tensor2D } {
  return {
    xs: tf.tensor2d(samples.map((s) => s.features)),
    ys: tf.tensor2d(samples.map((s) => s.label)),
  };
}

async function main() {
  const trainSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/train.json`, "utf8"));
  const validationSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/validation.json`, "utf8"));

  if (trainSamples.length === 0) {
    throw new Error("train.json이 비어 있습니다 — generate-dataset을 먼저 실행하고, 성공한 rollout이 있는지 확인하세요.");
  }

  const { xs: trainXs, ys: trainYs } = toTensors(trainSamples);
  const hasValidation = validationSamples.length > 0;
  const validationTensors = hasValidation ? toTensors(validationSamples) : null;

  const model = buildModel();
  const seed = 42; // 재현성 — model manifest에도 같은 값을 기록한다.

  const history = await model.fit(trainXs, trainYs, {
    epochs: 200,
    batchSize: 32,
    shuffle: true,
    validationData: validationTensors ? [validationTensors.xs, validationTensors.ys] : undefined,
    verbose: 0,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 20 === 0 || epoch === 199) {
          console.log(
            `epoch ${epoch}: loss=${logs?.loss?.toFixed(5)}${
              logs?.val_loss !== undefined ? ` val_loss=${logs.val_loss.toFixed(5)}` : ""
            }`
          );
        }
      },
    },
  });

  const finalLoss = history.history.loss[history.history.loss.length - 1];
  console.log(`학습 완료. 최종 train loss=${finalLoss}`);

  await saveModelToDisk(model, `${MODEL_DIR}/model.json`);
  writeFileSync(
    `${MODEL_DIR}/train-run.json`,
    JSON.stringify(
      {
        seed,
        epochs: 200,
        batchSize: 32,
        trainSamples: trainSamples.length,
        validationSamples: validationSamples.length,
        finalTrainLoss: finalLoss,
        finalValidationLoss: hasValidation
          ? history.history.val_loss?.[history.history.val_loss.length - 1]
          : null,
        trainedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`모델을 ${MODEL_DIR}/model.json 에 저장했습니다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
