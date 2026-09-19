import { expect, test } from "@playwright/test";

test("느린 GLB 로딩 중 경량 차나 오프닝을 먼저 보여주지 않는다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "high"));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/models/car-concept.glb", async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.getByRole("status", { name: "고화질 차량 준비 중" })).toBeVisible();
    // 동적 Three.js 모듈 준비와, 의도적으로 지연한 차량 파일 대기를 구분한다.
    await expect(page.locator(".scene-canvas")).toHaveAttribute("data-asset-state", "loading", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    await expect(page.getByLabel("기준 제어기 주차 시연")).toHaveCount(0);
    await expect(page.locator(".world-stage canvas")).not.toHaveAttribute("data-vehicle-asset", "fallback");
    await page.screenshot({ path: test.info().outputPath("ignition-loading.png") });
  } finally { release(); }
  await expect(page.locator(".scene-canvas")).toHaveAttribute("data-asset-state", "detailed", { timeout: 45_000 });
  await expect(page.getByRole("status", { name: "고화질 차량 준비 중" })).toHaveCount(0);
  await expect(page.getByLabel("기준 제어기 주차 시연")).toBeVisible();
  await page.getByRole("button", { name: "오프닝 건너뛰기" }).click();
  await expect(page.getByRole("button", { name: "바로 운전하기" })).toBeEnabled();
});

test("고화질 다운로드를 기다리지 않고 성능 우선으로 진입할 수 있다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "high"));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/models/car-concept.glb", async route => { await gate; await route.abort(); });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "가볍게 시작하기" }).click();
    await expect(page.locator(".scene-canvas")).toHaveAttribute("data-quality", "low");
    await expect(page.getByRole("status", { name: "고화질 차량 준비 중" })).toHaveCount(0);
    await page.getByRole("button", { name: "바로 운전하기" }).click();
    await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  } finally { release(); }
});

test("카드 조명은 마우스에 반응하고 선택·모션 중단·키보드 조작을 유지한다", async ({ page }) => {
  await page.goto("/#garage");
  const card = page.locator(".mission").nth(1);
  await card.hover();
  await expect(card).toHaveAttribute("data-lit", "true");
  expect(await card.evaluate(el => el.style.getPropertyValue("--light-x"))).not.toBe("");
  await page.getByRole("radio", { name: "옆 차 사이로 쏙" }).check();
  await expect(card).toHaveClass(/selected/);
  await page.getByRole("radio", { name: "기둥 옆 한 자리" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: "기둥 옆 한 자리" })).toBeChecked();
  await page.getByText("화면 설정 · AI 모델 정보",{exact:true}).click();
  await page.getByRole("checkbox",{name:"화면 움직임 줄이기"}).check();
  await card.hover();
  await expect(card).not.toHaveAttribute("data-lit");
  await expect(page.locator(".signal-ribbon > div")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".continuous-backdrop")).toHaveAttribute("data-motion", "paused");
});

for (const width of [1440, 390]) test(`전체 랜딩 ${width}px: 배경·텍스트·편집·푸터가 넘치지 않고 접근 가능하다`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#garage");
  await expect(page.locator(".reveal-text").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".continuous-backdrop")).toHaveAttribute("data-motion", "paused");
  for (const selector of [".design-manifesto", "#garage", "#experiment", ".sensor-lab", ".end-drive"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    if (selector === ".sensor-lab") {
      const viewport = page.locator(".lab-viewport");
      await expect(viewport.locator("canvas")).toBeVisible();
      await expect.poll(async () => {
        const canvas = await viewport.locator("canvas").boundingBox();
        const host = await viewport.boundingBox();
        return Math.abs((canvas?.height ?? 0) - (host?.height ?? 0));
      }).toBeLessThan(4);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${width}-${selector.replace(/[.#]/g, "")}.png`) });
  }
  await page.getByRole("link", { name: "내 주차장으로 돌아가기" }).click();
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await expect(page.getByLabel("3D 주차장 작업대")).toBeVisible();
  await page.getByRole("button", { name: "기둥 추가", exact: true }).click();
  await expect(page.getByLabel("중심 X (m)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /기록 설정/ }).click();
  await expect(page.getByRole("checkbox", { name: "학습용 기록 전송에 동의하고 켜기" })).not.toBeChecked();
});
