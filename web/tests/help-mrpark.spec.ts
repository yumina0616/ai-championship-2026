import { test, expect, type Page } from "@playwright/test";
import { newMap, mapScenario } from "../src/maps";
import { NOTICE_VERSION } from "../src/collection-record";
import type { LocalEpisode } from "../src/episodes";

// 정책만 고정해 실패를 재현한다. 이동·충돌·성공 판정은 실제 엔진을 사용한다.
async function failedMascot(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/src/policy.ts", r => r.fulfill({ contentType: "application/javascript", body: `
    import { POLICY_VERSION } from '/src/policy-info.ts';
    export async function loadPolicy() { return { version: POLICY_VERSION,
      predict: () => ({ targetSpeedMps: 1.5, targetSteeringRad: 0 }), dispose() {} }; }
  ` }));
  const map = newMap("open");
  map.start = { ...mapScenario(map).goalPose };
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page.getByLabel("맵 파일 열기").setInputFiles({ name: "help.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(map)) });
  await page.getByRole("button", { name: "맵 적용", exact: true }).click();
  await page.getByRole("button", { name: "미스터팍에게 맡기기" }).click();
  await expect(page.getByRole("button", { name: "내가 운전해 볼게" })).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".result-metrics")).toContainText(/충돌|경계 이탈/);
}

test("도움 제안에서 동의 없이 같은 출발점에 재도전하고 모바일에서도 조작 가능", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  let uploads = 0;
  await page.route("**/api/collection", r => r.fulfill({ json: { enabled: true, noticeVersion: NOTICE_VERSION } }));
  await page.route("**/api/episodes", r => { uploads++; return r.fulfill({ json: { stored: true } }); });
  await failedMascot(page);
  await page.screenshot({ path: test.info().outputPath("help-invitation-mobile.png") });
  await page.getByRole("button", { name: "내가 운전해 볼게" }).click();
  await expect(page.getByRole("checkbox", { name: "학습용 기록 전송에 동의하고 켜기" })).not.toBeChecked();
  await page.getByRole("button", { name: "기록 선택 닫기" }).click();
  await expect(page.getByRole("button", { name: "내가 운전해 볼게" })).toBeVisible();
  await page.getByRole("button", { name: "내가 운전해 볼게" }).click();
  await page.getByRole("button", { name: "선택하고 시작하기" }).click(); // 로컬만 보관
  await expect(page.getByRole("heading", { name: "이렇게 주차하는 거군요!" })).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".result-contribution")).toContainText("서버로 보내지 않았어요");
  expect(uploads).toBe(0);
  const records: LocalEpisode[] = await page.evaluate(async () => {
    const path = "/src/episodes.ts";
    return (await import(/* @vite-ignore */ path)).listEpisodes();
  });
  const human = records.find(r => r.header.controllerKind === "human")!;
  const ai = records.find(r => r.header.controllerKind === "learned")!;
  expect(human.header.scenarioSnapshot).toEqual(ai.header.scenarioSnapshot);
  expect(human.initial).toEqual(ai.initial);
  expect(human.footer.terminationReason).toBe("success");
  expect(human.header.episodeId).not.toBe(ai.header.episodeId);
  await page.getByRole("button", { name: "다음 도전부터 학습에 보태기" }).click();
  await page.getByRole("checkbox", { name: "학습용 기록 전송에 동의하고 켜기" }).check();
  expect(uploads).toBe(0); // 이전 성공 기록 소급 전송 없음
  await page.getByRole("button", { name: "기록 선택 닫기" }).click();
  await page.screenshot({ path: test.info().outputPath("help-success-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const stored of [true, false]) {
  test(`동의한 도움 주행은 현재 기록의 응답만 표시: 저장 ${stored}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(v => localStorage.setItem("mr-park-learning-consent", v), NOTICE_VERSION);
    await page.route("**/api/collection", r => r.fulfill({ json: { enabled: true, noticeVersion: NOTICE_VERSION } }));
    let release!: () => void;
    const response = new Promise<void>(resolve => { release = resolve; });
    const controllers: string[] = [];
    await page.route("**/api/episodes", async r => {
      const kind = r.request().postDataJSON().header.controllerKind;
      controllers.push(kind);
      if (kind === "human") await response;
      await r.fulfill({ status: kind === "human" && !stored ? 503 : 200, json: { stored: kind === "learned" || stored } });
    });
    await failedMascot(page);
    await expect.poll(() => controllers).toEqual(["learned"]);
    await page.getByRole("button", { name: "내가 운전해 볼게" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "이렇게 주차하는 거군요!" })).toBeVisible({ timeout: 25000 });
    await expect(page.locator(".result-contribution")).toContainText("전송 중이에요");
    await expect(page.locator(".result-contribution")).not.toContainText("전달했어요");
    release();
    await expect(page.locator(".result-contribution")).toContainText(stored ? "주행 기록을 전달했어요." : "기록 전달을 확인하지 못했어요.");
    if (stored) await expect(page.locator(".result-contribution")).toContainText("바로 모델이 업데이트되는 것은 아니에요");
    expect(controllers).toEqual(["learned", "human"]);
    await page.screenshot({ path: test.info().outputPath(`help-upload-${stored}.png`) });
  });
}

test("수집 불가 상태에서도 직접 도전하고 AI 직접 종료에는 도움 요청을 띄우지 않는다", async ({ page }) => {
  test.setTimeout(60000);
  await page.route("**/api/collection", r => r.fulfill({ json: { enabled: false } }));
  await failedMascot(page);
  await page.getByRole("button", { name: "미스터팍 다시 도전" }).click();
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GOOD RUN." })).toBeVisible();
  await expect(page.getByRole("button", { name: "내가 운전해 볼게" })).toHaveCount(0);
  await page.getByRole("button", { name: "같은 공간 다시 도전" }).click();
  await page.getByRole("button", { name: "내가 운전해 볼게" }).click({ timeout: 25000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "이렇게 주차하는 거군요!" })).toBeVisible({ timeout: 25000 });
  await expect(page.locator(".result-contribution")).toContainText("서버로 보내지 않았어요");
});
