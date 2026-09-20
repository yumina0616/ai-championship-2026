// #11: Hybrid A*로 성공한 rollout만 모아 학습 데이터셋을 만든다.
// docs/data-learning.md: "잘못된 조작을 무조건 정답 행동으로 학습시키지 않는다" — 실패
// (충돌/timeout/계획 실패)한 시나리오는 로그만 남기고 학습 데이터에서 제외한다.
//
// #17 조사에서 시나리오당 정확히 1개 경로만 학습에 쓰던 게 근본 원인 중 하나로 드러났다
// (private/policy-training-dagger-investigation.md 3장) — 시작 자세를 흔들어(jitter) 경로를
// 여러 개 만들고(시도 3), 조향값의 bang-bang 패턴을 이동평균으로 스무딩한 뒤 실제 엔진으로
// 재검증(시도 9)하는 걸로 데이터 생성 자체를 바꾼다. 이 조합(+64→32 용량, +체크포인트 선택
// train.ts)으로 실제 배포 시나리오(canonical start) 기준 성공 사례가 처음 나왔다(시도 19).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createRng,
  footprintCollides,
  footprintOutOfBounds,
  loadScenarioFromJson,
  planHybridAStar,
  flattenPrimitiveTargetsToCommands,
  appendHoldCommands,
  splitScenariosByLayoutGroup,
  type Scenario,
  type ScenarioJson,
  type StartState,
} from "../../engine/src/index.js";
import { jitterPose, DEFAULT_JITTER_OPTIONS } from "./startPoseAugment.js";
import { smoothSteering, replaySmoothedCommands, DEFAULT_SMOOTH_OPTIONS } from "./smoothedRollout.js";

/** 시나리오당 시작 자세를 이만큼 흔들어 시도한다 — #17 시도 8/10에서 검증된 값(맵당 1개→100개). */
const JITTER_ATTEMPTS_PER_SCENARIO = 100;

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_DIR = `${HERE}../../examples/scenarios`;
const DATA_DIR = `${HERE}../data`;

// invalid-overlap-start.v1.json은 계약 오류 케이스 fixture라 학습 대상이 아니다(#3 참고).
const SCENARIO_FILES = [
  "reverse-bay.v1.json",
  "parkside-open.v1.json",
  "parkside-neighbors.v1.json",
  "parkside-pillar.v1.json",
];

function loadScenario(fileName: string): Scenario {
  const json: ScenarioJson = JSON.parse(readFileSync(`${SCENARIOS_DIR}/${fileName}`, "utf8"));
  return loadScenarioFromJson(json);
}

export interface DatasetSample {
  features: number[];
  label: number[];
}

interface RolloutSummary {
  scenarioId: string;
  bucket: "train" | "validation" | "heldout";
  attempts: number;
  succeeded: number;
  usedForTraining: boolean;
  addedSamples: number;
}

/**
 * 시작 자세를 흔들어 Hybrid A*로 계획 -> 조향 스무딩 -> 실제 엔진 재생으로 검증(성공한 것만
 * 채택)한다. 실패한 시도는 조용히 버린다(docs/data-learning.md: 검증 안 된 조작을 정답으로
 * 쓰지 않는다). rng 시퀀스는 scenario.seed 기반이라 항상 같은 결과가 나온다(재현성).
 */
export function generateJitteredSmoothedSamples(scenario: Scenario, attempts: number): { succeeded: number; samples: DatasetSample[] } {
  const rng = createRng((scenario.seed ?? 0) * 2000 + 13);
  const samples: DatasetSample[] = [];
  let succeeded = 0;

  for (let i = 0; i < attempts; i++) {
    const jittered = jitterPose(scenario.start, rng, DEFAULT_JITTER_OPTIONS);
    if (footprintCollides(jittered, scenario.vehicle, scenario.obstacles) || footprintOutOfBounds(jittered, scenario.vehicle, scenario.bounds)) continue;

    const zero = { targetSpeedMps: 0, targetSteeringRad: 0 };
    const startOverride: StartState = { pose: jittered, lastAppliedCommand: zero };
    const plan = planHybridAStar(scenario, {}, startOverride);
    if (!plan.found) continue;

    const rawCommands = appendHoldCommands(scenario, flattenPrimitiveTargetsToCommands(scenario, plan.primitiveTargets, {}, startOverride));
    const smoothed = smoothSteering(rawCommands, DEFAULT_SMOOTH_OPTIONS);
    const result = replaySmoothedCommands(scenario, smoothed, startOverride);
    if (!result.success) continue;

    succeeded++;
    samples.push(...result.samples);
  }
  return { succeeded, samples };
}

function main() {
  const scenarios = SCENARIO_FILES.map(loadScenario);
  const split = splitScenariosByLayoutGroup(scenarios);

  const bucketOf = (scenario: Scenario): "train" | "validation" | "heldout" => {
    if (split.train.includes(scenario)) return "train";
    if (split.validation.includes(scenario)) return "validation";
    return "heldout";
  };

  const trainSamples: DatasetSample[] = [];
  const validationSamples: DatasetSample[] = [];
  const summaries: RolloutSummary[] = [];

  for (const scenario of scenarios) {
    const bucket = bucketOf(scenario);
    const usedForTraining = bucket === "train" || bucket === "validation";

    if (!usedForTraining) {
      // heldout은 절대 학습 데이터 생성에 안 쓴다(누출 방지) — 시나리오 자체만 heldout-scenarios.json에 보존.
      summaries.push({ scenarioId: scenario.scenarioId, bucket, attempts: 0, succeeded: 0, usedForTraining: false, addedSamples: 0 });
      console.log(`[${bucket}] ${scenario.scenarioId}: heldout이라 학습 데이터 생성 안 함`);
      continue;
    }

    console.log(`[${bucket}] ${scenario.scenarioId} 시작 자세 ${JITTER_ATTEMPTS_PER_SCENARIO}회 흔들어 계획 중...`);
    const { succeeded, samples } = generateJitteredSmoothedSamples(scenario, JITTER_ATTEMPTS_PER_SCENARIO);
    summaries.push({
      scenarioId: scenario.scenarioId,
      bucket,
      attempts: JITTER_ATTEMPTS_PER_SCENARIO,
      succeeded,
      usedForTraining: succeeded > 0,
      addedSamples: samples.length,
    });
    (bucket === "train" ? trainSamples : validationSamples).push(...samples);
    console.log(`  -> ${JITTER_ATTEMPTS_PER_SCENARIO}회 중 ${succeeded}회 성공, ${samples.length}개 (observation, action) 쌍 추가`);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${DATA_DIR}/train.json`, JSON.stringify(trainSamples));
  writeFileSync(`${DATA_DIR}/validation.json`, JSON.stringify(validationSamples));
  writeFileSync(
    `${DATA_DIR}/heldout-scenarios.json`,
    JSON.stringify(split.heldout.map((s) => ({ scenarioId: s.scenarioId, scenario: s })))
  );
  writeFileSync(`${DATA_DIR}/summary.json`, JSON.stringify(summaries, null, 2));

  console.log("\n=== 요약 ===");
  for (const s of summaries) console.log(JSON.stringify(s));
  console.log(`train samples: ${trainSamples.length}, validation samples: ${validationSamples.length}`);
  console.log(`heldout scenarios: ${split.heldout.map((s) => s.scenarioId).join(", ")}`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) main();
