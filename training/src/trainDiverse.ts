// #17 (과적합 해결 3단계): train.ts는 체크포인트를 고를 때 항상 고정된 3개 맵(parkside-open/
// neighbors/pillar, 장애물 추가 없음)으로만 평가했다 — 그래서 다양한 배치로 학습 데이터를
// 늘려도(2단계), 정작 "어느 체크포인트가 제일 좋은지" 고르는 기준 자체는 여전히 "장애물이
// 원래 그대로인 상황"만 보고 있었다. 이 스크립트는 그 기준에 학습 때 한 번도 안 쓴 새 무작위
// 배치(HELDOUT_LAYOUT_SEEDS, randomObstacleLayout.ts의 시드 0~14는 학습 데이터 생성에 이미
// 썼으므로 겹치지 않는 범위를 씀)를 더해서, "장애물이 달라도 되는지"까지 체크포인트 선택에
// 반영한다. train.ts와 거의 같은 구조지만(중복은 있지만 배포용 train.ts를 마감 직전에 건드리는
// 위험을 피하려고 이 브랜치 전용으로 분리했다), CHECKPOINT_SCENARIOS만 다르다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as tf from "@tensorflow/tfjs";
import { createRng, loadScenarioFromJson, type Scenario, type ScenarioJson } from "../../engine/src/index.js";
import { buildModel } from "./model.js";
import { saveModelToDisk } from "./modelIO.js";
import { createLearnedController } from "./policyController.js";
import { runLearnedEpisode } from "./evaluate.js";
import { seededShuffle } from "./train.js";
import { generateRandomObstacles, DEFAULT_RANDOM_LAYOUT_OPTIONS } from "./randomObstacleLayout.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = process.argv[2] ? resolve(process.argv[2]) : `${HERE}../data`;
const MODEL_DIR = process.argv[3] ? resolve(process.argv[3]) : `${HERE}../model`;
const SEED = 2;
const EPOCHS = 400;
const INITIAL_LR = 0.001;
const CHECKPOINT_EVERY_EPOCHS = 20;
// generateDiverseDataset.ts가 학습 데이터에 쓴 배치는 layoutSeed 0~14(맵당) — 겹치지 않게
// 500번대를 쓴다. "held-out"이라는 이름 그대로 학습에 전혀 등장하지 않은 배치들이다.
const HELDOUT_LAYOUT_SEEDS = [500, 501];

function loadNamedScenario(name: string): Scenario {
  const json: ScenarioJson = JSON.parse(readFileSync(`${HERE}../../examples/scenarios/${name}.v1.json`, "utf8"));
  return loadScenarioFromJson(json);
}

const CANONICAL_SCENARIOS = ["parkside-open", "parkside-neighbors", "parkside-pillar"].map(loadNamedScenario);
const HELDOUT_DIVERSE_SCENARIOS: Scenario[] = CANONICAL_SCENARIOS.flatMap((base) =>
  HELDOUT_LAYOUT_SEEDS.map((layoutSeed) => {
    const rng = createRng((base.seed ?? 0) * 100000 + layoutSeed * 977 + 11); // generateDiverseDataset.ts와 같은 식
    const extra = generateRandomObstacles(base, rng, DEFAULT_RANDOM_LAYOUT_OPTIONS);
    return { ...base, scenarioId: `${base.scenarioId}-heldout-${layoutSeed}`, obstacles: [...base.obstacles, ...extra] };
  })
);
/** 원래 3개 고정 맵(회귀 방지) + 학습에 없던 무작위 배치(일반화 확인)를 합쳐서 체크포인트를 고른다. */
const CHECKPOINT_SCENARIOS = [...CANONICAL_SCENARIOS, ...HELDOUT_DIVERSE_SCENARIOS];

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

async function main() {
  if (process.argv[2] && (!process.argv[3] || existsSync(MODEL_DIR))) throw Error("참여 데이터는 존재하지 않는 별도 후보 모델 폴더에 저장하세요.");
  const trainSamplesRaw: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/train.json`, "utf8"));
  const validationSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/validation.json`, "utf8"));
  if (trainSamplesRaw.length === 0) throw new Error("train.json이 비어 있습니다.");

  const trainSamples = seededShuffle(trainSamplesRaw, SEED);
  const model = buildModel(SEED);

  let bestScore = [-Infinity];
  let bestEpoch = 0;
  let bestCheckpoint: CheckpointRow[] = [];
  let finalLoss = NaN;

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
    const successCount = checkpoint.filter((c) => c.reason === "success").length;
    console.log(`epoch ${entry.epoch}: loss=${finalLoss.toFixed(5)} success=${successCount}/${CHECKPOINT_SCENARIOS.length} score=${JSON.stringify(score)}`);
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
        epochs: EPOCHS,
        batchSize: 32,
        initialLearningRate: INITIAL_LR,
        trainSamples: trainSamples.length,
        validationSamples: validationSamples.length,
        finalTrainLoss: finalLoss,
        checkpointSelection: {
          method: `매 ${CHECKPOINT_EVERY_EPOCHS}epoch마다 원래 3개 고정 맵 + 학습에 없던 무작위 배치 ${HELDOUT_DIVERSE_SCENARIOS.length}개(총 ${CHECKPOINT_SCENARIOS.length}개)를 굴려 성공 개수>충돌없음>오차 순으로 체크포인트 선택 — #17 과적합 해결 3단계`,
          heldoutLayoutSeeds: HELDOUT_LAYOUT_SEEDS,
          totalCheckpointScenarios: CHECKPOINT_SCENARIOS.length,
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

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
