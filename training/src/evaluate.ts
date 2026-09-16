// #11: heldout scenario(학습에 안 쓴 레이아웃)에서 학습된 모델을 실제로 실행해 평가한다.
// docs/data-learning.md: "결과가 나빠도 숨기지 않는다", "미평가 맵은 성능 보장하지 않는다".
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FIXED_DT_S,
  ParkingEngine,
  normalizeAngle,
  type Command,
  type Observation,
  type Scenario,
} from "../../engine/src/index.js";
import { createLearnedController } from "./policyController.js";
import { loadModelFromDisk } from "./modelIO.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = `${HERE}../data`;
const MODEL_DIR = `${HERE}../model`;
const MAX_STEPS = 4000;

interface EpisodeResult {
  scenarioId: string;
  terminationReason: string;
  success: boolean;
  collided: boolean;
  timedOut: boolean;
  stepCount: number;
  finalPositionErrorM: number | null;
  finalYawErrorRad: number | null;
  totalSimTimeS: number;
}

/** 단위 테스트에서 -pi/+pi 경계 회귀를 직접 검사할 수 있도록 순수 함수로 뺐다. */
export function computeFinalErrors(
  poseTruth: { xM: number; yM: number; yawRad: number },
  goalPose: { xM: number; yM: number; yawRad: number }
): { positionErrorM: number; yawErrorRad: number } {
  return {
    positionErrorM: Math.hypot(poseTruth.xM - goalPose.xM, poseTruth.yM - goalPose.yM),
    yawErrorRad: Math.abs(normalizeAngle(poseTruth.yawRad - goalPose.yawRad)),
  };
}

export function runLearnedEpisode(scenario: Scenario, controller: (o: Observation) => Command): EpisodeResult {
  const engine = new ParkingEngine();
  let observation = engine.reset(scenario);
  let outcome = { terminated: false, reason: null as string | null };
  let poseTruth = scenario.start;
  let simTimeS = 0;
  let stepCount = 0;

  for (; stepCount < MAX_STEPS; stepCount++) {
    const command = controller(observation);
    const result = engine.step(command, FIXED_DT_S);
    observation = result.observation;
    poseTruth = result.poseTruth;
    outcome = result.outcome;
    simTimeS = result.simTimeS;
    if (outcome.terminated) {
      stepCount++;
      break;
    }
  }

  const logComplete = outcome.terminated;
  const finalErrors = logComplete ? computeFinalErrors(poseTruth, scenario.goalPose) : null;
  const finalPositionErrorM = finalErrors?.positionErrorM ?? null;
  const finalYawErrorRad = finalErrors?.yawErrorRad ?? null;

  return {
    scenarioId: scenario.scenarioId,
    terminationReason: outcome.terminated ? (outcome.reason ?? "unknown") : "incomplete",
    success: outcome.reason === "success",
    collided: outcome.reason === "collision",
    timedOut: outcome.reason === "timeout",
    stepCount,
    finalPositionErrorM,
    finalYawErrorRad,
    totalSimTimeS: simTimeS,
  };
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function gitCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: `${HERE}../..` }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * git commit만으로는 재현 소스를 못 밝힌다 — 이 manifest 자체가 training/src/ 코드와 같은
 * 커밋에 함께 들어가므로, evaluate.ts 실행 시점의 `git rev-parse HEAD`는 아직 그 커밋이
 * 생성되기 전(부모 커밋)을 가리킨다(리뷰 지적: 이전 버전의 codeCommit=c58b7a9에는
 * training/ 코드 자체가 없었다). git 커밋 시점과 무관하게 재현 가능하도록, 실제 소스
 * 파일 내용의 해시를 같이 남긴다 — "이 해시가 나오는 training/src/*.ts가 이 모델을 만든
 * 코드"라는 뜻이다.
 */
function trainingSourceDigestSha256(): string {
  const srcDir = `${HERE}`;
  const fileNames = readdirSync(srcDir).filter((f) => f.endsWith(".ts")).sort();
  const hash = createHash("sha256");
  for (const fileName of fileNames) {
    hash.update(fileName);
    hash.update(readFileSync(`${srcDir}${fileName}`));
  }
  return hash.digest("hex");
}

async function main() {
  const model = await loadModelFromDisk(`${MODEL_DIR}/model.json`);
  const heldoutEntries: Array<{ scenarioId: string; scenario: Scenario }> = JSON.parse(
    readFileSync(`${DATA_DIR}/heldout-scenarios.json`, "utf8")
  );

  if (heldoutEntries.length === 0) {
    throw new Error("heldout-scenarios.json이 비어 있습니다 — generate-dataset을 먼저 실행하세요.");
  }

  const results: EpisodeResult[] = [];
  for (const entry of heldoutEntries) {
    const controller = createLearnedController(model, entry.scenario.vehicle);
    const result = runLearnedEpisode(entry.scenario, controller);
    results.push(result);
    console.log(`[heldout] ${entry.scenarioId}: ${JSON.stringify(result)}`);
  }

  const total = results.length;
  const successCount = results.filter((r) => r.success).length;
  const collisionCount = results.filter((r) => r.collided).length;
  const timeoutCount = results.filter((r) => r.timedOut).length;

  const report = {
    evaluatedAt: new Date().toISOString(),
    codeCommit: gitCommit(),
    heldoutScenarioCount: total,
    successRate: successCount / total,
    collisionRate: collisionCount / total,
    timeoutRate: timeoutCount / total,
    perScenario: results,
    limitations: [
      `heldout scenario가 ${total}개뿐이라 이 비율은 통계적으로 일반화할 수 없다 — docs/data-learning.md의 경고 그대로.`,
      "학습 데이터(parkside-open-v1, parkside-neighbors-v1)와 검증 데이터(parkside-pillar-v1)는 목표 pose가 모두 yaw=-90도(같은 방향 주차)인데, heldout(synthetic-reverse-bay)은 yaw=0(다른 방향)이다 — 학습 데이터에 없던 종류의 회전을 요구하는 만큼 특히 어려운 일반화 테스트다. 실제 웹 서비스가 노출하는 템플릿(open/neighbors/pillar)은 전부 학습·검증에 포함됐다.",
      "이 evaluate.ts는 학습에 쓰지 않은 scenario에서만 돌렸다(train/validation과 분리 확인됨 — generate-dataset.ts의 layoutGroup 분리 로직).",
      "실패(충돌) 시 즉시 종료되므로 실패 사례가 1개뿐이라 실패 유형 분포를 논하기엔 표본이 너무 작다.",
    ],
  };
  writeFileSync(`${MODEL_DIR}/eval-report.json`, JSON.stringify(report, null, 2));
  console.log("\n=== 평가 요약 ===");
  console.log(JSON.stringify({ successRate: report.successRate, collisionRate: report.collisionRate, timeoutRate: report.timeoutRate }, null, 2));

  const weightsBuffer = readFileSync(`${MODEL_DIR}/weights.bin`);
  const trainRun = JSON.parse(readFileSync(`${MODEL_DIR}/train-run.json`, "utf8"));
  const datasetSummary: Array<{ scenarioId: string; bucket: string; usedForTraining: boolean }> = JSON.parse(
    readFileSync(`${DATA_DIR}/summary.json`, "utf8")
  );
  // bucket을 반드시 구분한다 — 예전 버전은 usedForTraining만 봐서 validation(pillar)이
  // trainScenarioIds에 잘못 섞여 들어갔다(리뷰 지적).
  const trainScenarioIds = datasetSummary
    .filter((s) => s.bucket === "train" && s.usedForTraining)
    .map((s) => s.scenarioId);
  const validationScenarioIds = datasetSummary
    .filter((s) => s.bucket === "validation" && s.usedForTraining)
    .map((s) => s.scenarioId);
  const excludedScenarioIds = datasetSummary
    .filter((s) => (s.bucket === "train" || s.bucket === "validation") && !s.usedForTraining)
    .map((s) => s.scenarioId);

  const manifest = {
    policyVersion: "parking-mlp-v1",
    artifactChecksumSha256: sha256(weightsBuffer),
    framework: "@tensorflow/tfjs",
    frameworkVersion: "4.x",
    runtime: "pure-js (cpu backend) — 브라우저와 동일 패키지, tfjs-node 미사용(Windows 네이티브 바인딩 로드 실패로 회피)",
    observationSchema: {
      featureOrder: "sensors[36] (range_m/10, valid 아니면 1) + speed/maxForward + steer/maxSteering + goalRelative.x/10 + goalRelative.y/10 + goalRelative.yaw/pi",
      expectedRayCount: 36,
    },
    actionSchema: {
      labelOrder: "[targetSpeedMps/speedLimit, targetSteeringRad/maxSteeringRad]",
      note: "speedLimit은 부호에 따라 maxForwardSpeedMps 또는 maxReverseSpeedMps",
    },
    supportedVehicle: "synthetic-compact-v1 (examples/scenarios 참고) — 다른 차종/센서 배치는 미지원",
    trainDataSnapshot: {
      trainScenarioIds,
      validationScenarioIds,
      excludedScenarioIds,
      note:
        excludedScenarioIds.length > 0
          ? `${excludedScenarioIds.join(", ")}은 Hybrid A*가 success로 마치지 못해 이번 학습에서 제외됨(#11 알려진 한계, README 참고)`
          : "이번 실행에서는 후보 scenario 전부 성공적으로 rollout을 만들어 학습·검증에 사용함",
    },
    trainConfig: trainRun,
    sourceProvenance: {
      trainingSourceDigestSha256: trainingSourceDigestSha256(),
      digestNote:
        "training/src/*.ts 전체(파일명순 정렬) 내용의 SHA-256 — 이 값이 나오는 소스가 이 모델을 만든 코드다.",
      gitCommitAtGenerationTime: gitCommit(),
      gitCommitNote:
        "이 값은 evaluate.ts 실행 시점의 HEAD다. model-manifest.json 자체가 training/ 코드와 같은 커밋으로 함께 커밋되므로, 이 커밋 해시 하나만으로는 생성 코드를 재현할 수 없다(리뷰 지적) — 위 digest를 신뢰하거나, 이 manifest 파일이 실제로 들어있는 커밋(git log -- training/model/model-manifest.json)을 봐야 한다.",
    },
    license: "저장소 프로젝트 라이선스 미확정 — README.md '라이선스·권리' 참고",
    evaluationConfigAndResults: "training/model/eval-report.json (이 파일과 같은 커밋에서 생성)",
  };
  writeFileSync(`${MODEL_DIR}/model-manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\nmodel manifest: ${MODEL_DIR}/model-manifest.json`);
}

// 테스트 파일이 computeFinalErrors/runLearnedEpisode를 import할 때 main()이 같이 실행되지
// 않도록(모델/데이터 파일이 없으면 process.exit(1)로 테스트가 죽는다) 직접 실행될 때만 돈다.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
