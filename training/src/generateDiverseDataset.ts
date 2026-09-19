// #17 (과적합 해결 2단계): randomObstacleLayout.ts로 만든 무작위 장애물 배치 여러 개에,
// generateDataset.ts와 같은 시작 자세 흔들기+스무딩 파이프라인을 적용해 학습 데이터를 만든다.
// 기존 3개 맵(open/neighbors/pillar)의 train/validation 배정은 그대로 유지하고, 각 맵마다
// 장애물을 무작위로 추가한 변형을 여러 개(layoutsPerScenario) 만든다 — "이 배치에서 목표까지
// 가는 법"이 아니라 "장애물이 다르게 있어도 피하는 법"을 배우게 하는 게 목적이다.
//
// 이와 별개로, 학습에 전혀 안 쓴 새 무작위 배치(heldoutLayouts)를 따로 만들어
// data/heldout-layouts.json에 저장한다 — 나중에 "본 적 없는 배치에서 몇 %나 성공하는지"를
// 재는 새 평가 세트다(기존 reverse-bay 하나짜리 heldout은 방향이 다른 것뿐, 장애물 다양성
// 테스트가 아니었다).
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  createRng,
  loadScenarioFromJson,
  splitScenariosByLayoutGroup,
  type Scenario,
  type ScenarioJson,
} from "../../engine/src/index.js";
import { generateJitteredSmoothedSamples, type DatasetSample } from "./generateDataset.js";
import { generateRandomObstacles, DEFAULT_RANDOM_LAYOUT_OPTIONS, type RandomLayoutOptions } from "./randomObstacleLayout.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SCENARIOS_DIR = `${HERE}../../examples/scenarios`;

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

interface LayoutSummary {
  scenarioId: string;
  bucket: "train" | "validation";
  layoutSeed: number;
  extraObstacleCount: number;
  attempts: number;
  succeeded: number;
  addedSamples: number;
}

async function main() {
  const [outDirArg, layoutsArg, attemptsArg] = process.argv.slice(2);
  if (!outDirArg) throw new Error("사용법: generateDiverseDataset <새 데이터셋 폴더> [맵당 배치 수=15] [배치당 시도 횟수=10]");
  const outDir = resolve(outDirArg);
  if (existsSync(outDir)) throw new Error("이미 존재하는 폴더입니다 — 원본을 안 덮어쓰도록 새 폴더만 쓰세요.");

  const layoutsPerScenario = layoutsArg ? Number(layoutsArg) : 15;
  const attemptsPerLayout = attemptsArg ? Number(attemptsArg) : 10;
  const layoutOptions: Partial<RandomLayoutOptions> = DEFAULT_RANDOM_LAYOUT_OPTIONS;

  const scenarios = SCENARIO_FILES.map(loadScenario);
  const split = splitScenariosByLayoutGroup(scenarios);
  const bucketOf = (scenario: Scenario): "train" | "validation" | "heldout" => {
    if (split.train.includes(scenario)) return "train";
    if (split.validation.includes(scenario)) return "validation";
    return "heldout";
  };

  const trainSamples: DatasetSample[] = [];
  const validationSamples: DatasetSample[] = [];
  const summaries: LayoutSummary[] = [];

  for (const baseScenario of scenarios) {
    const bucket = bucketOf(baseScenario);
    if (bucket === "heldout") continue; // reverse-bay는 기존과 동일하게 학습에서 제외

    for (let layoutSeed = 0; layoutSeed < layoutsPerScenario; layoutSeed++) {
      const layoutRng = createRng((baseScenario.seed ?? 0) * 100000 + layoutSeed * 977 + 11);
      const extra = generateRandomObstacles(baseScenario, layoutRng, layoutOptions);
      const scenario: Scenario = { ...baseScenario, obstacles: [...baseScenario.obstacles, ...extra] };

      console.log(`[${bucket}] ${baseScenario.scenarioId} 배치#${layoutSeed}(장애물 +${extra.length}) 시작 자세 ${attemptsPerLayout}회...`);
      const { succeeded, samples } = generateJitteredSmoothedSamples(scenario, attemptsPerLayout);
      summaries.push({
        scenarioId: baseScenario.scenarioId,
        bucket,
        layoutSeed,
        extraObstacleCount: extra.length,
        attempts: attemptsPerLayout,
        succeeded,
        addedSamples: samples.length,
      });
      (bucket === "train" ? trainSamples : validationSamples).push(...samples);
      console.log(`  -> ${attemptsPerLayout}회 중 ${succeeded}회 성공, ${samples.length}개 샘플`);
    }
  }

  mkdirSync(outDir, { recursive: false, mode: 0o700 });
  writeFileSync(`${outDir}/train.json`, JSON.stringify(trainSamples));
  writeFileSync(`${outDir}/validation.json`, JSON.stringify(validationSamples));
  copyFileSync(`${HERE}../data/heldout-scenarios.json`, `${outDir}/heldout-scenarios.json`);
  writeFileSync(`${outDir}/layout-summary.json`, JSON.stringify({ layoutsPerScenario, attemptsPerLayout, layoutOptions, summaries }, null, 2));

  console.log("\n=== 요약 ===");
  console.log(`train: ${trainSamples.length}개, validation: ${validationSamples.length}개`);
  const totalLayouts = summaries.length;
  const feasibleLayouts = summaries.filter((s) => s.succeeded > 0).length;
  console.log(`배치 ${totalLayouts}개 중 ${feasibleLayouts}개에서 성공 사례 확보`);
  console.log(`상세: ${outDir}/layout-summary.json`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
