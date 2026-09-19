// #17 (2차 피드백 채택안): 실패 궤적에서 드문드문 후보를 뽑는 대신, 선생님(Hybrid A*)과
// 학생(현재 정책)의 궤적을 나란히 비교해 "학생이 처음으로 눈에 띄게 어긋나는 지점"만 정확히
// 찾아서, 그 지점(학생이 실제로 만든 상태)에서 집중적으로 복구 데이터를 만든다. 그 구간이 평범한
// 주행 프레임 수백 개에 묻히지 않도록 명시적으로 오버샘플링(가중치)한다.
//
// docs/data-learning.md: "잘못된 조작을 무조건 정답 행동으로 학습시키지 않는다" — 학생이 실제로
// 낸 잘못된 command는 절대 라벨로 안 쓰고, 그 지점에서 Hybrid A*가 다시 계산한 정답만 쓴다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as tf from "@tensorflow/tfjs";
import {
  createRng,
  loadScenarioFromJson,
  runHybridAStarRollout,
  type Scenario,
  type ScenarioJson,
  type StartState,
  type VehicleSpec,
} from "../../engine/src/index.js";
import { commandToLabel, FEATURE_SIZE, LABEL_SIZE } from "./features.js";
import { createLearnedController } from "./policyController.js";
import { loadModelFromDisk, saveModelToDisk } from "./modelIO.js";
import {
  generateRecoverySamples,
  runLearnedEpisodeWithTrajectory,
  type RecoverySample,
  type TrajectoryStep,
} from "./recoveryAugment.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_DIR = `${HERE}../../examples/scenarios`;
const SEED = 42;

export function loadScenario(fileName: string): Scenario {
  const json: ScenarioJson = JSON.parse(readFileSync(`${SCENARIOS_DIR}/${fileName}`, "utf8"));
  return loadScenarioFromJson(json);
}

/** Hybrid A*가 원래(scenario.start부터) 계획한 "선생님" 궤적. 학생과 나란히 비교할 기준선. */
export function teacherTrajectoryFor(scenario: Scenario): TrajectoryStep[] {
  const rollout = runHybridAStarRollout(scenario, { episodeId: `teacher-${scenario.scenarioId}` });
  if (!rollout.planFound || !rollout.episode || !rollout.episode.footer.success) {
    throw new Error(`teacherTrajectoryFor: ${scenario.scenarioId}에서 Hybrid A*가 성공 경로를 못 찾음(전제 위반).`);
  }
  return rollout.episode.steps.map((step) => ({ pose: step.nextStateTruth, appliedCommand: step.appliedCommandT }));
}

export interface DeviationOptions {
  /** 정규화([-1,1]) 라벨 공간에서 teacher/student가 적용한 command 차이 임계값. */
  commandDiffThreshold: number;
  /** teacher/student 위치 차이 임계값(m). */
  positionDiffThresholdM: number;
}

export const DEFAULT_DEVIATION_OPTIONS: DeviationOptions = {
  commandDiffThreshold: 0.15,
  positionDiffThresholdM: 0.15,
};

/**
 * teacher/student 궤적을 스텝 인덱스 기준으로 나란히 비교해 "처음으로 눈에 띄게 어긋나는" 인덱스를
 * 찾는다. 둘 다 같은 시작 상태에서 같은 dt로 진행하므로, 초반(아직 안 벌어졌을 때)엔 인덱스 기준
 * 비교가 유효하다. 끝까지 안 벗어나면(=학생이 선생님을 잘 따라감) null.
 */
export function findFirstDeviationIndex(
  teacherTrajectory: TrajectoryStep[],
  studentTrajectory: TrajectoryStep[],
  vehicle: VehicleSpec,
  options: Partial<DeviationOptions> = {}
): number | null {
  const opts = { ...DEFAULT_DEVIATION_OPTIONS, ...options };
  const n = Math.min(teacherTrajectory.length, studentTrajectory.length);
  for (let i = 0; i < n; i++) {
    const teacherLabel = commandToLabel(teacherTrajectory[i]!.appliedCommand, vehicle);
    const studentLabel = commandToLabel(studentTrajectory[i]!.appliedCommand, vehicle);
    const commandDiff = Math.hypot(teacherLabel[0]! - studentLabel[0]!, teacherLabel[1]! - studentLabel[1]!);
    const teacherPose = teacherTrajectory[i]!.pose;
    const studentPose = studentTrajectory[i]!.pose;
    const positionDiffM = Math.hypot(teacherPose.xM - studentPose.xM, teacherPose.yM - studentPose.yM);
    if (commandDiff > opts.commandDiffThreshold || positionDiffM > opts.positionDiffThresholdM) return i;
  }
  return null;
}

export interface DeviationRecoveryResult {
  deviationIndex: number;
  recoveryFromIndex: number;
  samples: RecoverySample[];
}

/**
 * 첫 이탈 지점(학생이 실제로 만든 상태)에서 Hybrid A* 복구를 시도한다. 그 지점 자체가 이미
 * 손쓸 수 없는 상태라면(계획 실패) backStepSize씩 더 이른(=이탈이 덜 진행된) 지점으로 물러나며
 * 재시도한다 — "선생님도 성공 못 하면 더 이른 이탈 지점으로 돌아가서 시도"(사용자 지시 3번).
 */
export function findDeviationRecovery(
  scenario: Scenario,
  studentTrajectory: TrajectoryStep[],
  deviationIndex: number,
  episodeIdPrefix: string,
  options: { backStepSize?: number; maxBackSteps?: number } = {}
): DeviationRecoveryResult | null {
  const backStepSize = options.backStepSize ?? 5;
  const maxBackSteps = options.maxBackSteps ?? 20;
  for (let back = 0; back <= maxBackSteps; back++) {
    const index = deviationIndex - back * backStepSize;
    if (index < 0) return null;
    const candidate: StartState = {
      pose: studentTrajectory[index]!.pose,
      lastAppliedCommand: studentTrajectory[index]!.appliedCommand,
    };
    const samples = generateRecoverySamples(scenario, candidate, `${episodeIdPrefix}-back${back}`);
    if (samples) return { deviationIndex, recoveryFromIndex: index, samples };
  }
  return null;
}

// ---------- 한 라운드 실행: self-play -> 첫 이탈 지점 -> 복구 데이터 -> 재학습 -> 평가 ----------

interface Sample { features: number[]; label: number[]; }

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = createRng(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function buildModel(): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_SIZE], units: 32, activation: "relu", kernelInitializer: tf.initializers.glorotUniform({ seed: SEED }) }));
  model.add(tf.layers.dense({ units: 16, activation: "relu", kernelInitializer: tf.initializers.glorotUniform({ seed: SEED + 1 }) }));
  model.add(tf.layers.dense({ units: LABEL_SIZE, activation: "tanh", kernelInitializer: tf.initializers.glorotUniform({ seed: SEED + 2 }) }));
  model.compile({ optimizer: tf.train.adam(0.005), loss: "meanSquaredError" });
  return model;
}

async function main() {
  const [modelPathArg, baseDataDirArg, outDataDirArg, outModelDirArg, weightArg] = process.argv.slice(2);
  if (!modelPathArg || !baseDataDirArg || !outDataDirArg || !outModelDirArg) {
    throw new Error("사용법: first-deviation-round <현재 모델.json> <기존 데이터 폴더> <새 데이터 폴더> <새 모델 폴더> [복구 가중치=5]");
  }
  const recoveryWeight = weightArg ? Number(weightArg) : 5;
  const outDataDir = resolve(outDataDirArg);
  const outModelDir = resolve(outModelDirArg);
  if (existsSync(outDataDir) || existsSync(outModelDir)) throw new Error("이미 존재하는 폴더입니다 — 새 폴더만 쓰세요.");

  const scenario = loadScenario("parkside-open.v1.json");
  const model = await loadModelFromDisk(modelPathArg);
  const controller = createLearnedController(model, scenario.vehicle);

  console.log("1) 학생(현재 모델) self-play 중...");
  const failed = runLearnedEpisodeWithTrajectory(scenario, controller);
  if (!failed) {
    console.log("이미 성공함 — 더 이상 보정할 게 없습니다.");
    model.dispose();
    return;
  }
  console.log(`   -> ${failed.terminationReason}, ${failed.trajectory.length}스텝 생존`);

  console.log("2) 선생님(Hybrid A*) 기준 궤적 계산 중...");
  const teacher = teacherTrajectoryFor(scenario);

  console.log("3) 첫 이탈 지점 탐색 중...");
  const deviationIndex = findFirstDeviationIndex(teacher, failed.trajectory, scenario.vehicle);
  if (deviationIndex === null) {
    console.log("teacher/student가 끝까지 안 벌어짐 — 이탈 지점을 못 찾음.");
    model.dispose();
    return;
  }
  console.log(`   -> 스텝 ${deviationIndex}에서 처음 어긋남`);

  console.log("4) 그 지점에서 Hybrid A* 복구 계획 중(실패하면 더 이른 지점으로 물러남)...");
  const recovery = findDeviationRecovery(scenario, failed.trajectory, deviationIndex, `dev-${scenario.scenarioId}`);
  if (!recovery) {
    console.log("복구 지점을 못 찾음(선생님도 회복 불가) — 종료.");
    model.dispose();
    return;
  }
  console.log(
    `   -> 스텝 ${recovery.recoveryFromIndex}(이탈점보다 ${recovery.deviationIndex - recovery.recoveryFromIndex}스텝 앞)에서 복구 성공, 샘플 ${recovery.samples.length}개, 가중치 ${recoveryWeight}배로 추가`
  );

  const baseTrain: Sample[] = JSON.parse(readFileSync(`${baseDataDirArg}/train.json`, "utf8"));
  const weightedRecovery: Sample[] = Array.from({ length: recoveryWeight }, () => recovery.samples).flat();
  const trainSamples = [...baseTrain, ...weightedRecovery];

  console.log(`5) 재학습 중... (기존 ${baseTrain.length}개 + 복구 ${recovery.samples.length}개 x ${recoveryWeight} = 총 ${trainSamples.length}개)`);
  const shuffled = seededShuffle(trainSamples, SEED);
  const xs = tf.tensor2d(shuffled.map((s) => s.features));
  const ys = tf.tensor2d(shuffled.map((s) => s.label));
  const newModel = buildModel();
  const history = await newModel.fit(xs, ys, {
    epochs: 200,
    batchSize: 32,
    shuffle: false,
    verbose: 0,
    callbacks: { onEpochEnd: (epoch, logs) => { if (epoch % 50 === 0 || epoch === 199) console.log(`   epoch ${epoch}: loss=${logs?.loss?.toFixed(5)}`); } },
  });
  console.log("   최종 loss", history.history.loss[history.history.loss.length - 1]);

  mkdirSync(outDataDir, { recursive: false, mode: 0o700 });
  writeFileSync(`${outDataDir}/train.json`, JSON.stringify(trainSamples));
  writeFileSync(
    `${outDataDir}/deviation-summary.json`,
    JSON.stringify(
      {
        deviationIndex: recovery.deviationIndex,
        recoveryFromIndex: recovery.recoveryFromIndex,
        recoverySamples: recovery.samples.length,
        recoveryWeight,
        baseTrainCount: baseTrain.length,
        totalTrainCount: trainSamples.length,
      },
      null,
      2
    )
  );
  await saveModelToDisk(newModel, `${outModelDir}/model.json`);
  console.log(`저장: ${outDataDir}, ${outModelDir}`);

  console.log("\n6) 새 모델 단독(self-play) 평가...");
  const newController = createLearnedController(newModel, scenario.vehicle);
  const newFailed = runLearnedEpisodeWithTrajectory(scenario, newController);
  if (!newFailed) {
    console.log("   -> 성공! (self-play로 목표 도달)");
  } else {
    console.log(`   -> ${newFailed.terminationReason}, ${newFailed.trajectory.length}스텝 생존 (이전: ${failed.trajectory.length}스텝)`);
  }

  model.dispose();
  newModel.dispose();
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
