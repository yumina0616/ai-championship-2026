// #17 (기본 정책 먼저 강화): recoveryAugment.ts로 self-play 실패 지점을 보정해봤지만 개선이
// 없었다 — 원인을 까보니 학습 데이터가 맵당 Hybrid A* 경로 "딱 1개"뿐이었다(open 1개, neighbors
// 1개, pillar 1개). 즉 정책이 "주차하는 법"이 아니라 "그 경로 하나"를 외운 상태라, 실제 주행 중
// 아주 작은 편차만 생겨도 학습 때 한 번도 못 본 상태에 빠져 무너진다(DAgger가 고치려는 "가끔의
// 실수"가 아니라 "기본 커버리지 부족" 문제).
//
// 그래서 DAgger(정책을 실행해서 실패를 찾는 방식)보다 먼저, 정책을 전혀 실행하지 않고도 Hybrid
// A*(자동 전문가)만으로 다양성을 넓힌다 — 같은 맵에서 시작 자세를 살짝 흔든 뒤 다시 계획해
// "정답 경로"를 더 많이 만든다. 아직 안 좋은 정책의 상태 분포를 쫓아다니지 않으므로(recoveryAugment
// 가 겪은 문제), 결과가 항상 유효한 성공 경로다.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  createRng,
  footprintCollides,
  footprintOutOfBounds,
  loadScenarioFromJson,
  normalizeAngle,
  runHybridAStarRollout,
  splitScenariosByLayoutGroup,
  type Pose,
  type Scenario,
  type ScenarioJson,
} from "../../engine/src/index.js";
import { observationToFeatures, commandToLabel } from "./features.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_DIR = `${HERE}../../examples/scenarios`;
const DATA_DIR = `${HERE}../data`;

// generateDataset.ts/recoveryAugment.ts와 반드시 같은 목록·순서를 써야 splitScenariosByLayoutGroup이
// 같은 train/validation/heldout 배정을 재현한다 — heldout 유출 방지의 핵심 전제.
const SCENARIO_FILES = [
  "reverse-bay.v1.json",
  "parkside-open.v1.json",
  "parkside-neighbors.v1.json",
  "parkside-pillar.v1.json",
];

export interface JitterOptions {
  /** 시작 위치를 [-positionJitterM, +positionJitterM] 범위로 흔든다(x, y 각각). */
  positionJitterM: number;
  /** 시작 방향을 [-yawJitterRad, +yawJitterRad] 범위로 흔든다. */
  yawJitterRad: number;
  /** 맵 하나당 몇 번 시도할지. */
  attemptsPerScenario: number;
}

export const DEFAULT_JITTER_OPTIONS: JitterOptions = {
  positionJitterM: 0.3,
  yawJitterRad: (10 * Math.PI) / 180,
  attemptsPerScenario: 15,
};

/** 순수 함수 — 같은 rng 시퀀스면 항상 같은 결과(재현 가능성, docs/data-learning.md 원칙). */
export function jitterPose(pose: Pose, rng: () => number, opts: JitterOptions): Pose {
  return {
    xM: pose.xM + (rng() * 2 - 1) * opts.positionJitterM,
    yM: pose.yM + (rng() * 2 - 1) * opts.positionJitterM,
    yawRad: normalizeAngle(pose.yawRad + (rng() * 2 - 1) * opts.yawJitterRad),
  };
}

export interface JitteredSample {
  features: number[];
  label: number[];
}

/**
 * 흔든 시작 자세가 이미 장애물/경계와 겹치면 애초에 시도하지 않고 null(=버림). 겹치지 않으면
 * 거기서부터 Hybrid A*로 다시 계획하고, 실제 엔진으로 재생해 (features,label) 샘플을 만든다.
 * 계획을 못 찾거나 재생이 success로 안 끝나면 null(=이 jitter는 버리고 다음 시도로).
 */
export function generateJitteredRolloutSamples(
  scenario: Scenario,
  jitteredPose: Pose,
  episodeId: string
): JitteredSample[] | null {
  if (
    footprintCollides(jitteredPose, scenario.vehicle, scenario.obstacles) ||
    footprintOutOfBounds(jitteredPose, scenario.vehicle, scenario.bounds)
  ) {
    return null;
  }
  const zero = { targetSpeedMps: 0, targetSteeringRad: 0 };
  const rollout = runHybridAStarRollout(scenario, { episodeId }, {}, { pose: jitteredPose, lastAppliedCommand: zero });
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

interface ScenarioJitterSummary {
  scenarioId: string;
  bucket: "train" | "validation";
  attempts: number;
  succeeded: number;
  addedSamples: number;
}

function loadScenario(fileName: string): Scenario {
  const json: ScenarioJson = JSON.parse(readFileSync(`${SCENARIOS_DIR}/${fileName}`, "utf8"));
  return loadScenarioFromJson(json);
}

async function main() {
  const [outDirArg] = process.argv.slice(2);
  if (!outDirArg) throw new Error("사용법: startpose-augment <새 데이터셋 폴더>");
  const outDir = resolve(outDirArg);
  if (existsSync(outDir)) throw new Error("이미 존재하는 폴더입니다 — 원본을 안 덮어쓰도록 새 폴더만 쓰세요.");

  const opts = DEFAULT_JITTER_OPTIONS;
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

  const summaries: ScenarioJitterSummary[] = [];

  for (const scenario of scenarios) {
    const bucket = bucketOf(scenario);
    // heldout은 절대 학습 데이터 생성에 안 쓴다(누출 방지) — recoveryAugment.ts와 같은 원칙.
    if (bucket === "heldout") continue;

    console.log(`[${bucket}] ${scenario.scenarioId} 시작 자세 ${opts.attemptsPerScenario}회 흔들어 재계획 중...`);
    // 시나리오별로 독립적이고 재현 가능한 시퀀스 — scenario.seed 기반.
    const rng = createRng((scenario.seed ?? 0) * 1000 + 7);

    let succeeded = 0;
    let addedSamples = 0;
    for (let i = 0; i < opts.attemptsPerScenario; i++) {
      const jittered = jitterPose(scenario.start, rng, opts);
      const samples = generateJitteredRolloutSamples(scenario, jittered, `jitter-${scenario.scenarioId}-${i}`);
      if (!samples) continue;
      succeeded++;
      addedSamples += samples.length;
      (bucket === "train" ? trainSamples : validationSamples).push(...samples);
    }

    summaries.push({
      scenarioId: scenario.scenarioId,
      bucket,
      attempts: opts.attemptsPerScenario,
      succeeded,
      addedSamples,
    });
    console.log(`  -> ${opts.attemptsPerScenario}회 중 ${succeeded}회 성공, 샘플 ${addedSamples}개 추가`);
  }

  mkdirSync(outDir, { recursive: false, mode: 0o700 });
  writeFileSync(`${outDir}/train.json`, JSON.stringify(trainSamples));
  writeFileSync(`${outDir}/validation.json`, JSON.stringify(validationSamples));
  copyFileSync(`${DATA_DIR}/heldout-scenarios.json`, `${outDir}/heldout-scenarios.json`);
  writeFileSync(`${outDir}/jitter-summary.json`, JSON.stringify(summaries, null, 2));

  console.log("\n=== 요약 ===");
  console.log(`train: ${originalTrainCount} -> ${trainSamples.length}개`);
  console.log(`validation: ${originalValidationCount} -> ${validationSamples.length}개`);
  console.log(`상세: ${outDir}/jitter-summary.json`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
