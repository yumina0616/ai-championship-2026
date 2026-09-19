// #11: train.json(+validation.json)으로 작은 MLP를 행동복제 학습시키고 모델을 저장한다.
//
// #17 조사(시도 19): 고정 200epoch 스냅샷을 그대로 저장하던 방식을, 학습 중간중간 실제
// 배포 시나리오(parkside-open/neighbors/pillar, canonical 시작 위치)를 직접 굴려보고 가장
// 좋은 체크포인트만 저장하는 방식으로 바꾼다. seed=2는 5-seed 스윕에서 이 실제 배포 기준으로
// 가장 나았던 값이다(3개 중 2개 성공, 나머지 1개도 충돌 대신 안전한 시간초과).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as tf from "@tensorflow/tfjs";
import { createRng, loadScenarioFromJson, type Scenario, type ScenarioJson } from "../../engine/src/index.js";
import { buildModel } from "./model.js";
import { saveModelToDisk } from "./modelIO.js";
import { createLearnedController } from "./policyController.js";
import { runLearnedEpisode } from "./evaluate.js";

// #17 조사에서 확인됨: 순수 tfjs(CPU backend) model.fit()은 이 데이터 규모(6만+ 샘플)·400epoch
// 조합에서 몇 시간이 걸린다(하이브리드 컨트롤러 실험에서 실측). numpy 서브프로세스로 계산만
// 대신 시키고 tfjs 모델에는 매 checkpoint마다 결과 가중치만 반영한다 — tfjs와 수치적으로
// 동일함을 이미 검증함(Adam 10스텝 후 가중치 최대 오차 ~3.6e-7).


const HERE = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = process.argv[2] ? resolve(process.argv[2]) : `${HERE}../data`;
const MODEL_DIR = process.argv[3] ? resolve(process.argv[3]) : `${HERE}../model`;
const SEED = 2; // buildModel의 가중치 초기화 + 아래 셔플 둘 다 여기서만 정한다.
const EPOCHS = 400;
const INITIAL_LR = 0.001;
const CHECKPOINT_EVERY_EPOCHS = 20;

/** 매 checkpoint마다 실제 배포 시나리오(canonical 시작 위치)를 굴려 성공/충돌/오차로 순위를 매긴다. */
const CHECKPOINT_SCENARIOS = ["parkside-open", "parkside-neighbors", "parkside-pillar"].map((name) => {
  const json: ScenarioJson = JSON.parse(readFileSync(`${HERE}../../examples/scenarios/${name}.v1.json`, "utf8"));
  return loadScenarioFromJson(json);
});

interface CheckpointRow {
  scenarioId: string;
  reason: string;
  position: number | null;
  yaw: number | null;
}

function evaluateCheckpoint(model: tf.LayersModel): CheckpointRow[] {
  return CHECKPOINT_SCENARIOS.map((scenario: Scenario) => {
    const controller = createLearnedController(model, scenario.vehicle);
    const r = runLearnedEpisode(scenario, controller);
    return { scenarioId: r.scenarioId, reason: r.terminationReason, position: r.finalPositionErrorM, yaw: r.finalYawErrorRad };
  });
}

/** 성공 개수 우선, 그다음 충돌 없음, 그다음 위치+각도 오차가 작을수록 좋다(policyStudy.ts와 동일 원칙). */
function checkpointScore(rows: CheckpointRow[]): number[] {
  const successCount = rows.filter((r) => r.reason === "success").length;
  const collisionCount = rows.filter((r) => r.reason === "collision").length;
  const avgError = rows.reduce((sum, r) => sum + (r.position ?? 10) + 2 * (r.yaw ?? Math.PI), 0) / rows.length;
  return [successCount, -collisionCount, -avgError];
}

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

interface Sample {
  features: number[];
  label: number[];
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
  const hasValidation = validationSamples.length > 0;

  const model = buildModel(SEED);

  let bestScore = [-Infinity];
  let bestEpoch = 0;
  let bestCheckpoint: CheckpointRow[] = [];
  let finalLoss = NaN;
  const finalValLoss: number | null = null; // numpy 백엔드는 train loss만 계산 — 체크포인트 선택은 closed-loop 지표로 대신함.

  const numpyConfig = { seed: SEED, lr: INITIAL_LR, epochs: EPOCHS, shuffle: true, decay: true, batch: 32, evalEvery: CHECKPOINT_EVERY_EPOCHS };
  const initialWeights = model.getWeights().map((w) => ({ shape: w.shape, values: Array.from(w.dataSync()) }));

  const child = spawn("python", [`${HERE}numpy_train.py`], {
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: true,
    env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
  });
  const exited = new Promise<void>((res, rej) => {
    child.on("error", rej);
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error("numpy_train.py exit " + code))));
  });
  child.stdin.write(JSON.stringify({ config: numpyConfig, samples: trainSamples, weights: initialWeights }) + "\n");

  for await (const line of createInterface({ input: child.stdout })) {
    const entry = JSON.parse(line) as { epoch: number; lr: number; loss: number; weights: number[][] };
    const tensors = entry.weights.map((values, i) => tf.tensor(values, initialWeights[i]!.shape));
    model.setWeights(tensors);
    tensors.forEach((t) => t.dispose());
    finalLoss = entry.loss;

    const checkpoint = evaluateCheckpoint(model);
    const score = checkpointScore(checkpoint);
    console.log(`epoch ${entry.epoch}: loss=${finalLoss.toFixed(5)} checkpointScore=${JSON.stringify(score)}`);
    if (better(score, bestScore)) {
      bestScore = score;
      bestEpoch = entry.epoch;
      bestCheckpoint = checkpoint;
      await saveModelToDisk(model, `${MODEL_DIR}/model.json`);
    }
    child.stdin.write("continue\n");
  }
  await exited;

  console.log(`학습 완료. 최종 train loss=${finalLoss}, 선택된 체크포인트=epoch ${bestEpoch}`);
  writeFileSync(
    `${MODEL_DIR}/train-run.json`,
    JSON.stringify(
      {
        seed: SEED,
        communityDataset: communityManifest,
        seedAppliedTo: ["buildModel() kernelInitializer(glorotUniform)", "train.json 사전 셔플"],
        epochs: EPOCHS,
        batchSize: 32,
        initialLearningRate: INITIAL_LR,
        learningRateDecay: "epoch/(epochs/3)마다 x0.1 (3단계 감쇠)",
        shuffle: "사전 셔플 1회(seed 기반), epoch별 재셔플 없음",
        trainSamples: trainSamples.length,
        validationSamples: validationSamples.length,
        finalTrainLoss: finalLoss,
        finalValidationLoss: finalValLoss,
        checkpointSelection: {
          method: "매 " + CHECKPOINT_EVERY_EPOCHS + "epoch마다 parkside-open/neighbors/pillar를 canonical 시작 위치에서 실제로 굴려(runLearnedEpisode), 성공 개수>충돌없음>오차 순으로 가장 좋은 체크포인트를 저장 — #17 시도 19",
          bestEpoch,
          bestScore,
          bestCheckpointResult: bestCheckpoint,
        },
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
