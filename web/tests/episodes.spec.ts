import { test, expect } from "@playwright/test";
import { ParkingEngine, type StepResult } from "../../engine/src/index";
import { makeScenario } from "../src/driving";
import {
  appendStep,
  beginEpisode,
  finishEpisode,
  parseEpisode,
  recordedFrame,
  EPISODE_BYTES,
} from "../src/episodes";

function sample(ticks = 3) {
  const s = makeScenario("open"),
    engine = new ParkingEngine();
  let before: StepResult = {
    observation: engine.reset(s),
    poseTruth: s.start,
    simTimeS: 0,
    appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 },
    outcome: { terminated: false, reason: null },
  };
  const context = { viewMode: "top", assistanceFlags: ["parking-status"] };
  const e = beginEpisode(s, before, context);
  for (let i = 0; i < ticks; i++) {
    const command = { targetSpeedMps: 0, targetSteeringRad: 0 },
      next = engine.step(command);
    appendStep(e, before, command, next, {
      ...context,
      gear: "P",
      inputs: [],
      analogSteer: null,
    });
    before = next;
    if (next.outcome.terminated) break;
  }
  return finishEpisode(e, before.outcome.reason ?? "user_abort");
}
test("관측→명령→다음 상태 정렬과 불완전/실패/timeout roundtrip", () => {
  for (const count of [0, 3, 1801]) {
    const e = sample(count),
      text = JSON.stringify(e);
    expect(new TextEncoder().encode(text).length).toBeLessThan(EPISODE_BYTES);
    expect(parseEpisode(text)).toEqual(e);
    expect(recordedFrame(e, e.steps.length).simTimeS).toBe(
      e.footer.totalSimTimeS,
    );
  }
  const e = sample();
  e.footer = finishEpisode(e, "incomplete").footer;
  expect(parseEpisode(JSON.stringify(e)).footer).toMatchObject({
    terminationReason: "incomplete",
    logComplete: false,
    success: false,
  });
  expect(e.header.consent.status).toBe("not_requested");
});
test("손상·중복·누락·허위 성공·센서·외부 설정 거부", () => {
  for (const mutate of [
    (e: ReturnType<typeof sample>) => {
      e.steps[1].stepIndex = 0;
    },
    (e: ReturnType<typeof sample>) => {
      e.steps.splice(0, 1);
    },
    (e: ReturnType<typeof sample>) => {
      e.steps[1].simTimeS = 5;
    },
    (e: ReturnType<typeof sample>) => {
      e.steps[0].nextObservation.sensors[0].rangeM = Infinity;
    },
    (e: ReturnType<typeof sample>) => {
      e.footer.success = true;
    },
    (e: ReturnType<typeof sample>) => {
      e.header.scenarioSnapshot.sensor.rayCount = 100000;
    },
    (e: ReturnType<typeof sample>) => {
      e.steps[1].observationT.speedMps = 1;
    },
  ]) {
    const e = sample();
    mutate(e);
    expect(() => parseEpisode(JSON.stringify(e))).toThrow();
  }
});
test("로컬 기록 파일은 상태 재생으로 열리고 업로드하지 않는다", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("내 주행 기록", { exact: false }).click();
  const e = sample();
  await page.getByLabel("기록 파일 열기").setInputFiles({
    name: "episode.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(e)),
  });
  await expect(
    page.getByRole("heading", { name: "기록 재생 · AI 실시간 운전 아님" }),
  ).toBeVisible();
  await page.getByLabel("재생 위치", { exact: true }).fill("3");
  await expect(page.getByTestId("playback-frame")).toContainText("0.15초");
  await expect(
    page.getByRole("region", { name: "저장 상태 재생" }),
  ).toContainText("user_abort");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "열린 기록 내보내기" }).click();
  expect((await download).suggestedFilename()).toContain(e.header.episodeId);
  expect(posts).toEqual([]);
});
test("센서 결측은 null로 보존하고 0m로 바꾸지 않는다", () => {
  const e = sample(0);
  e.initial.observation.sensors[0].valid = false;
  e.initial.observation.sensors[0].rangeM = NaN;
  const text = JSON.stringify(e);
  expect(JSON.parse(text).initial.observation.sensors[0].rangeM).toBeNull();
  expect(
    Number.isNaN(parseEpisode(text).initial.observation.sensors[0].rangeM),
  ).toBe(true);
});

test("실제 주행을 중단하면 IndexedDB에 남고 새로고침 후 복원", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "이번 연습 마치기" }).click();
  await page.getByRole("button", { name: "공간 바꾸기" }).click();
  await page.reload();
  await page.getByText("내 주행 기록", { exact: false }).click();
  await expect(page.locator(".episode-list")).toContainText("user_abort");
  await page
    .getByRole("button", { name: "기록 재생", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "기록 재생 · AI 실시간 운전 아님" }),
  ).toBeVisible();
  await page.screenshot({ path: "/private/tmp/parkside-record-player.png" });
});

test("저장소 거부 시에도 메모리 기록 내보내기가 가능", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("storage denied");
      },
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "이번 연습 마치기" }).click();
  await expect(page.getByRole("alert")).toContainText("저장에 실패");
  await page.getByRole("button", { name: "공간 바꾸기" }).click();
  await page.getByText("내 주행 기록", { exact: false }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "기록 내보내기", exact: true })
    .click();
  expect((await download).suggestedFilename()).toContain("parkside-episode");
});
