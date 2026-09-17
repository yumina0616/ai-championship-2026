// #11: train.json(+validation.json)으로 작은 MLP를 행동복제 학습시키고 모델을 저장한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as tf from "@tensorflow/tfjs";
import { createRng } from "../../engine/src/index.js";
import { buildModel } from "./model.js";
import { saveModelToDisk } from "./modelIO.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = process.argv[2] ? resolve(process.argv[2]) : `${HERE}../data`;
const MODEL_DIR = process.argv[3] ? resolve(process.argv[3]) : `${HERE}../model`;
const SEED = 42; // buildModel의 가중치 초기화 + 아래 셔플 둘 다 여기서만 정한다.

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

/** Fisher-Yates, engine의 seed 기반 PRNG로 — Math.random()을 쓰면 재현이 안 된다. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = createRng(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

async function main() {
  if (process.argv[2] && (!process.argv[3] || existsSync(MODEL_DIR))) throw Error("참여 데이터는 존재하지 않는 별도 후보 모델 폴더에 저장하세요.");
  const manifestPath = `${DATA_DIR}/community-manifest.json`;
  const communityManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  if (communityManifest) {
    if (!Number.isFinite(Date.parse(communityManifest.createdAt)) || Date.now() - Date.parse(communityManifest.createdAt) > 86400000) throw Error("삭제 반영을 위해 export/prepare를 새로 실행하세요.");
    for (const name of ["train.json", "validation.json", "heldout-scenarios.json"]) {
      if (createHash("sha256").update(readFileSync(`${DATA_DIR}/${name}`)).digest("hex") !== communityManifest.files[name]) throw Error("dataset_checksum_mismatch");
    }
  }
  const trainSamplesRaw: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/train.json`, "utf8"));
  const validationSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/validation.json`, "utf8"));

  if (trainSamplesRaw.length === 0) {
    throw new Error("train.json이 비어 있습니다 — generate-dataset을 먼저 실행하고, 성공한 rollout이 있는지 확인하세요.");
  }

  // model.fit의 shuffle:true는 tfjs 내부적으로 Math.random을 써서 재현이 안 된다(리뷰 지적).
  // 대신 여기서 한 번 결정론적으로 섞어두고 fit에는 shuffle:false를 준다 — 매 epoch 재셔플은
  // 포기하지만(작은 데이터셋이라 학습 품질에 미치는 영향은 적다고 판단), 같은 seed로 다시
  // 돌리면 가중치 초기화·데이터 순서가 완전히 같아 실제로 재현 가능하다.
  const trainSamples = seededShuffle(trainSamplesRaw, SEED);

  const { xs: trainXs, ys: trainYs } = toTensors(trainSamples);
  const hasValidation = validationSamples.length > 0;
  const validationTensors = hasValidation ? toTensors(validationSamples) : null;

  const model = buildModel(SEED);

  const history = await model.fit(trainXs, trainYs, {
    epochs: 200,
    batchSize: 32,
    shuffle: false, // 위에서 이미 결정론적으로 섞음
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
        seed: SEED,
        communityDataset: communityManifest,
        seedAppliedTo: ["buildModel() kernelInitializer(glorotUniform)", "train.json 사전 셔플"],
        epochs: 200,
        batchSize: 32,
        shuffle: "사전 셔플 1회(seed 기반), epoch별 재셔플 없음",
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

// 테스트가 seededShuffle을 import할 때 전체 학습이 같이 돌지 않도록 직접 실행될 때만 돈다.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
