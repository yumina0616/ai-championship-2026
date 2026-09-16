import { test, expect } from "@playwright/test";
import { ParkingEngine } from "../../engine/src/index";
import { makeScenario } from "../src/driving";
import {
  beginEpisode,
  finishEpisode,
  comparisonError,
  episodeFooter,
  parseEpisode,
} from "../src/episodes";
import { POLICY_VERSION } from "../src/policy-info";

function fixture(policy: boolean) {
  const s = makeScenario("open"),
    engine = new ParkingEngine();
  return finishEpisode(
    beginEpisode(
      s,
      {
        observation: engine.reset(s),
        poseTruth: s.start,
        simTimeS: 0,
        appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 },
        outcome: { terminated: false, reason: null },
      },
      {
        viewMode: "top",
        assistanceFlags: policy ? ["spectator"] : ["parking-status"],
      },
      policy ? POLICY_VERSION : null,
    ),
    policy ? "policy_error" : "user_abort",
  );
}
test("같은 초기조건만 비교하고 실패 지표도 재계산한다", () => {
  const a = parseEpisode(JSON.stringify(fixture(false))),
    b = parseEpisode(JSON.stringify(fixture(true)));
  expect(comparisonError(a, b)).toBeNull();
  expect(episodeFooter(b, b.footer.terminationReason)).toEqual(b.footer);
  for (const mutate of [
    (e: typeof b) => {
      e.header.seed++;
    },
    (e: typeof b) => {
      e.header.scenarioSnapshot.vehicle.widthM += 0.1;
    },
    (e: typeof b) => {
      e.header.scenarioSnapshot.start.xM += 0.1;
    },
    (e: typeof b) => {
      e.header.scenarioSnapshot.sensor.maxRangeM++;
    },
    (e: typeof b) => {
      e.header.scenarioSnapshot.timeoutSimS++;
    },
    (e: typeof b) => {
      e.initial.observation.speedMps = 0.1;
    },
  ]) {
    const changed = structuredClone(b);
    mutate(changed);
    expect(comparisonError(a, changed)).not.toBeNull();
  }
  expect(comparisonError(a, a)).not.toBeNull();
});
test("파일 두 개를 비교하고 불완전·중단·모델 버전을 숨기지 않는다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("내 주행 기록", { exact: false }).click();
  for (const record of [fixture(false), fixture(true)]) {
    await page
      .getByLabel("기록 파일 열기")
      .setInputFiles({
        name: "record.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(record)),
      });
    await page.getByRole("button", { name: "열린 기록 비교에 추가" }).click();
  }
  const comparison = page.getByRole("region", { name: "시도 비교" });
  await expect(comparison).toContainText("user_abort");
  await expect(comparison).toContainText("policy_error");
  await expect(comparison).toContainText("불완전 기록");
  await expect(comparison).toContainText(POLICY_VERSION);
  await expect(page.getByLabel("동일 조건 경로 겹쳐보기")).toBeVisible();
  await page.getByRole("button", { name: "A 비교에서 빼기" }).click();
  await expect(page.getByLabel("동일 조건 경로 겹쳐보기")).toHaveCount(0);
});
