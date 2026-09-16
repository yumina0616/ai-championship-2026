// #11: heldout scenario(학습에 안 쓴 레이아웃)에서 학습된 모델을 실제로 실행해 평가한다.
// docs/data-learning.md: "결과가 나빠도 숨기지 않는다", "미평가 맵은 성능 보장하지 않는다".
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FIXED_DT_S, ParkingEngine, type Command, type Observation, type Scenario } from "../../engine/src/index.js";
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

function runLearnedEpisode(scenario: Scenario, controller: (o: Observation) => Command): EpisodeResult {
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
  const finalPositionErrorM = logComplete
    ? Math.hypot(poseTruth.xM - scenario.goalPose.xM, poseTruth.yM - scenario.goalPose.yM)
    : null;
  const finalYawErrorRad = logComplete ? Math.abs(poseTruth.yawRad - scenario.goalPose.yawRad) : null;

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
  const usedScenarioIds = datasetSummary.filter((s) => s.usedForTraining).map((s) => s.scenarioId);
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
      trainScenarioIds: usedScenarioIds,
      excludedScenarioIds,
      note:
        excludedScenarioIds.length > 0
          ? `${excludedScenarioIds.join(", ")}은 Hybrid A*가 success로 마치지 못해 이번 학습에서 제외됨(#11 알려진 한계, README 참고)`
          : "이번 실행에서는 후보 scenario 전부 성공적으로 rollout을 만들어 학습에 사용함",
    },
    trainConfig: trainRun,
    codeCommit: gitCommit(),
    license: "저장소 프로젝트 라이선스 미확정 — README.md '라이선스·권리' 참고",
    evaluationConfigAndResults: "training/model/eval-report.json (이 파일과 같은 커밋에서 생성)",
  };
  writeFileSync(`${MODEL_DIR}/model-manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\nmodel manifest: ${MODEL_DIR}/model-manifest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
