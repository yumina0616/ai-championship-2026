// #11: Hybrid A*로 성공한 rollout만 모아 학습 데이터셋을 만든다.
// docs/data-learning.md: "잘못된 조작을 무조건 정답 행동으로 학습시키지 않는다" — 실패
// (충돌/timeout/계획 실패)한 시나리오는 로그만 남기고 학습 데이터에서 제외한다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadScenarioFromJson,
  runHybridAStarRollout,
  splitScenariosByLayoutGroup,
  type Scenario,
  type ScenarioJson,
} from "../../engine/src/index.js";
import { commandToLabel, observationToFeatures } from "./features.js";

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

interface DatasetSample {
  features: number[];
  label: number[];
}

interface RolloutSummary {
  scenarioId: string;
  bucket: "train" | "validation" | "heldout";
  planFound: boolean;
  expandedNodes: number;
  success: boolean;
  collided: boolean;
  terminationReason: string;
  stepCount: number;
  usedForTraining: boolean;
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
    console.log(`[${bucket}] ${scenario.scenarioId} 계획 중...`);
    const result = runHybridAStarRollout(scenario, { episodeId: `dataset-${scenario.scenarioId}` });

    const usedForTraining =
      (bucket === "train" || bucket === "validation") &&
      result.episode !== null &&
      result.episode.footer.success;

    summaries.push({
      scenarioId: scenario.scenarioId,
      bucket,
      planFound: result.planFound,
      expandedNodes: result.expandedNodes,
      success: result.episode?.footer.success ?? false,
      collided: result.episode?.footer.collided ?? false,
      terminationReason: result.episode?.footer.terminationReason ?? "plan_not_found",
      stepCount: result.episode?.steps.length ?? 0,
      usedForTraining,
    });

    if (!usedForTraining) {
      console.log(
        `  -> 학습 데이터로 안 씀 (bucket=${bucket}, planFound=${result.planFound}, success=${result.episode?.footer.success})`
      );
      continue;
    }

    const samples = result.episode!.steps.map((step) => ({
      features: observationToFeatures(step.observationT, scenario.vehicle),
      label: commandToLabel(step.appliedCommandT, scenario.vehicle),
    }));
    (bucket === "train" ? trainSamples : validationSamples).push(...samples);
    console.log(`  -> ${samples.length}개 (observation, action) 쌍 추가`);
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
