// #17: 학습된 정책을 자체 시나리오에서 굴려본 뒤, 성공하지 못한 주행의 중간 지점에서
// Hybrid A*(자동 전문가)로 "여기서부터 다시 정상 복귀하는 경로"를 계획해 학습 데이터에 보탠다.
//
// DAgger(Ross, Gordon, Bagnell, AISTATS 2011)처럼 "정책 자신이 방문한 상태"를 보정하되, 사람
// 라벨 대신 특권 정보(poseTruth)에 접근 가능한 Hybrid A*를 자동 전문가로 쓴다 — 사람에게 매
// 헤매는 순간마다 물어보는 건 새 환경일수록 감당 안 되게 늘어나지만(DAgger의 실제 병목), 우리는
// 시뮬레이션 안에서 물리를 완벽히 알고 있어 탐색으로 정답을 계산할 수 있다(Learning by Cheating,
// Chen, Zhang, Krähenbühl, Koltun, CoRL 2020과 같은 발상 — 사람 대신 특권 전문가 사용).
//
// docs/data-learning.md: "잘못된 조작을 무조건 정답 행동으로 학습시키지 않는다" — 그래서 실패한
// 주행 자체는 절대 학습에 안 쓰고, 그 중간 지점에서 Hybrid A*가 실제로 성공 경로를 다시 찾아낸
// 경우만 학습 샘플로 쓴다. Hybrid A*도 실패하면(=이미 손쓸 수 없던 상태) 그 후보는 버린다.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  FIXED_DT_S,
  footprintCollides,
  footprintOutOfBounds,
  loadScenarioFromJson,
  ParkingEngine,
  runHybridAStarRollout,
  splitScenariosByLayoutGroup,
  type Command,
  type Observation,
  type Pose,
  type Scenario,
  type ScenarioJson,
  type StartState,
} from "../../engine/src/index.js";
import { observationToFeatures, commandToLabel } from "./features.js";
import { createLearnedController } from "./policyController.js";
import { loadModelFromDisk } from "./modelIO.js";

const MAX_STEPS = 4000;
const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_DIR = `${HERE}../../examples/scenarios`;
const DATA_DIR = `${HERE}../data`;
const MODEL_DIR = `${HERE}../model`;

// generateDataset.ts와 반드시 같은 목록·순서를 써야 splitScenariosByLayoutGroup이 같은
// train/validation/heldout 배정을 재현한다 — heldout 유출 방지의 핵심 전제.
const SCENARIO_FILES = [
  "reverse-bay.v1.json",
  "parkside-open.v1.json",
  "parkside-neighbors.v1.json",
  "parkside-pillar.v1.json",
];

export interface TrajectoryStep {
  pose: Pose;
  appliedCommand: Command;
}

export interface FailedRollout {
  scenario: Scenario;
  trajectory: TrajectoryStep[];
  terminationReason: string;
}

/**
 * evaluate.ts의 runLearnedEpisode와 달리 궤적 전체(pose+appliedCommand)를 남긴다 — 복구 시작점
 * 후보를 뽑으려면 중간 상태가 필요하기 때문이다. 성공으로 끝난 주행은 복구 대상이 아니므로 null.
 */
export function runLearnedEpisodeWithTrajectory(
  scenario: Scenario,
  controller: (o: Observation) => Command
): FailedRollout | null {
  const engine = new ParkingEngine();
  let observation = engine.reset(scenario);
  const trajectory: TrajectoryStep[] = [];
  let outcome: { terminated: boolean; reason: string | null } = { terminated: false, reason: null };

  for (let step = 0; step < MAX_STEPS; step++) {
    const command = controller(observation);
    const result = engine.step(command, FIXED_DT_S);
    trajectory.push({ pose: result.poseTruth, appliedCommand: result.appliedCommand });
    observation = result.observation;
    outcome = result.outcome;
    if (outcome.terminated) break;
  }

  if (outcome.reason === "success") return null;
  return {
    scenario,
    trajectory,
    terminationReason: outcome.terminated ? (outcome.reason ?? "unknown") : "incomplete",
  };
}

export interface RecoveryCandidateOptions {
  /** 종료 직전(충돌 직전 등)은 보통 이미 손쓸 수 없다 — 뒤에서 이만큼 스텝을 건너뛴다. */
  tailExclusionSteps: number;
  /** 맨 처음 몇 스텝은 원래 시작점과 사실상 같아 새로운 정보가 거의 없다 — 앞에서 건너뛴다. */
  headExclusionSteps: number;
  /** 후보를 몇 스텝 간격으로 뽑을지(너무 촘촘하면 거의 같은 상태를 중복 계획하게 된다). */
  strideSteps: number;
}

export const DEFAULT_RECOVERY_CANDIDATE_OPTIONS: RecoveryCandidateOptions = {
  tailExclusionSteps: 20, // FIXED_DT_S(0.05s) * 20 = 1.0s
  headExclusionSteps: 40, // 2.0s
  strideSteps: 10, // 0.5s 간격
};

/**
 * 실패한 궤적에서 "아직 복구를 시도해볼 만한" 중간 상태 후보들을 뽑는다. 이미 충돌/경계이탈
 * 상태인 pose는 애초에 후보에서 제외한다 — isGoal()의 정지 시뮬레이션은 lastAppliedCommand의
 * 속도가 이미 0에 가까우면 "지금 pose가 충돌 중인지"를 따로 검사하지 않기 때문에(원래
 * scenario.start는 reset()이 항상 검증해서 문제없었지만, 여기서는 임의 중간 pose를 시작점으로
 * 쓰므로 직접 걸러야 한다). tailExclusionSteps가 충돌 직전 스텝을 배제하므로 실제로는 잘
 * 안 걸리지만, 방어적으로 명시한다.
 */
export function findRecoveryCandidates(
  failed: FailedRollout,
  options: Partial<RecoveryCandidateOptions> = {}
): StartState[] {
  const opts = { ...DEFAULT_RECOVERY_CANDIDATE_OPTIONS, ...options };
  const { trajectory, scenario } = failed;
  const candidates: StartState[] = [];
  const lastIndex = trajectory.length - 1 - opts.tailExclusionSteps;
  for (let i = opts.headExclusionSteps; i <= lastIndex; i += opts.strideSteps) {
    const step = trajectory[i];
    if (!step) continue;
    if (
      footprintCollides(step.pose, scenario.vehicle, scenario.obstacles) ||
      footprintOutOfBounds(step.pose, scenario.vehicle, scenario.bounds)
    ) {
      continue;
    }
    candidates.push({ pose: step.pose, lastAppliedCommand: step.appliedCommand });
  }
  return candidates;
}

export interface RecoverySample {
  features: number[];
  label: number[];
}

/**
 * 후보 지점에서 Hybrid A*(자동 전문가)로 복구 경로를 계획하고, 실제 엔진으로 재생해
 * (features,label) 학습 샘플을 만든다. 계획을 못 찾거나 재생이 success로 안 끝나면
 * (=이미 손쓸 수 없던 상태였거나 계획-재생 불일치) null을 반환하고 버린다.
 */
export function generateRecoverySamples(
  scenario: Scenario,
  candidate: StartState,
  episodeId: string,
  plannerOptions: Parameters<typeof runHybridAStarRollout>[2] = {}
): RecoverySample[] | null {
  const rollout = runHybridAStarRollout(scenario, { episodeId }, plannerOptions, candidate);
  if (!rollout.planFound || !rollout.episode || !rollout.episode.footer.success) return null;
  return rollout.episode.steps.map((step) => ({
    features: observationToFeatures(step.observationT, scenario.vehicle),
    label: commandToLabel(step.appliedCommandT, scenario.vehicle),
  }));
}

interface Sample {
  features: number[];
  label: number[];
}

interface ScenarioAugmentSummary {
  scenarioId: string;
  bucket: "train" | "validation";
  outcome: string; // "already_success" | terminationReason
  candidatesAttempted: number;
  candidatesRecovered: number;
  addedSamples: number;
}

function loadScenario(fileName: string): Scenario {
  const json: ScenarioJson = JSON.parse(readFileSync(`${SCENARIOS_DIR}/${fileName}`, "utf8"));
  return loadScenarioFromJson(json);
}

// 정책이 심하게 나쁘면(전혀 안 움직이는 등) 후보가 수백 개까지 나올 수 있는데, 후보 하나마다
// Hybrid A* 전체 탐색(최악의 경우 수십 초)이 붙으므로 그대로 다 시도하면 CLI가 사실상 끝나지
// 않는다. 균등 간격으로 최대 개수만 뽑아 최악의 실행 시간을 제한한다 — 대표성은 stride 기반
// findRecoveryCandidates가 이미 어느 정도 확보하므로, 여기서는 "너무 많으면 골고루 덜어내기"만 한다.
const MAX_CANDIDATES_PER_SCENARIO = 15;

function subsampleEvenly<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const stepSize = items.length / maxCount;
  return Array.from({ length: maxCount }, (_, i) => items[Math.floor(i * stepSize)]!);
}

async function main() {
  const [outDirArg] = process.argv.slice(2);
  if (!outDirArg) throw new Error("사용법: recovery-augment <새 데이터셋 폴더>");
  const outDir = resolve(outDirArg);
  if (existsSync(outDir)) throw new Error("이미 존재하는 폴더입니다 — 원본을 안 덮어쓰도록 새 폴더만 쓰세요.");

  const model = await loadModelFromDisk(`${MODEL_DIR}/model.json`);
  const scenarios = SCENARIO_FILES.map(loadScenario);
  const split = splitScenariosByLayoutGroup(scenarios);
  const bucketOf = (scenario: Scenario): "train" | "validation" | "heldout" => {
    if (split.train.includes(scenario)) return "train";
    if (split.validation.includes(scenario)) return "validation";
    return "heldout";
  };

  const trainSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/train.json`, "utf8"));
  const validationSamples: Sample[] = JSON.parse(readFileSync(`${DATA_DIR}/validation.json`, "utf8"));
  const originalTrainCount = trainSamples.length;
  const originalValidationCount = validationSamples.length;

  const summaries: ScenarioAugmentSummary[] = [];

  for (const scenario of scenarios) {
    const bucket = bucketOf(scenario);
    // heldout은 학습 데이터 생성에 절대 안 쓴다 — 자기 자신에게 유리해지는 유출을 막기 위함
    // (docs/data-learning.md, splitScenariosByLayoutGroup과 같은 원칙).
    if (bucket === "heldout") continue;

    console.log(`[${bucket}] ${scenario.scenarioId} 자체 정책 rollout 중...`);
    const controller = createLearnedController(model, scenario.vehicle);
    const failed = runLearnedEpisodeWithTrajectory(scenario, controller);

    if (!failed) {
      summaries.push({
        scenarioId: scenario.scenarioId,
        bucket,
        outcome: "already_success",
        candidatesAttempted: 0,
        candidatesRecovered: 0,
        addedSamples: 0,
      });
      console.log(`  -> 이미 성공(추가 복구 데이터 불필요)`);
      continue;
    }

    const candidates = subsampleEvenly(findRecoveryCandidates(failed), MAX_CANDIDATES_PER_SCENARIO);
    let recovered = 0;
    let addedSamples = 0;
    candidates.forEach((candidate, i) => {
      console.log(`  후보 ${i + 1}/${candidates.length} 계획 중...`);
      const samples = generateRecoverySamples(scenario, candidate, `recovery-${scenario.scenarioId}-${i}`);
      if (!samples) return;
      recovered++;
      addedSamples += samples.length;
      (bucket === "train" ? trainSamples : validationSamples).push(...samples);
    });

    summaries.push({
      scenarioId: scenario.scenarioId,
      bucket,
      outcome: failed.terminationReason,
      candidatesAttempted: candidates.length,
      candidatesRecovered: recovered,
      addedSamples,
    });
    console.log(
      `  -> ${failed.terminationReason}, 후보 ${candidates.length}개 중 ${recovered}개 복구 성공, 샘플 ${addedSamples}개 추가`
    );
  }

  mkdirSync(outDir, { recursive: false, mode: 0o700 });
  writeFileSync(`${outDir}/train.json`, JSON.stringify(trainSamples));
  writeFileSync(`${outDir}/validation.json`, JSON.stringify(validationSamples));
  copyFileSync(`${DATA_DIR}/heldout-scenarios.json`, `${outDir}/heldout-scenarios.json`);
  writeFileSync(`${outDir}/recovery-summary.json`, JSON.stringify(summaries, null, 2));

  console.log("\n=== 요약 ===");
  console.log(`train: ${originalTrainCount} -> ${trainSamples.length}개`);
  console.log(`validation: ${originalValidationCount} -> ${validationSamples.length}개`);
  console.log(`상세: ${outDir}/recovery-summary.json`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
