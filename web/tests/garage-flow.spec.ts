import { test, expect } from "@playwright/test";
import { newMap, mapScenario } from "../src/maps";

test("차고 새로고침은 최상단에서 오프닝을 다시 재생하고 일반 딥링크는 생략한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/#garage");
  await expect(page.getByLabel("기준 제어기 주차 시연")).toHaveCount(0);
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).scrollIntoViewIfNeeded();
  await page.reload();
  const intro = page.getByLabel("기준 제어기 주차 시연");
  await expect(intro).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(intro).toContainText("Built to move.");
  await expect(intro).toContainText("Sense the invisible.", { timeout: 15000 });
  await expect(intro).toHaveCount(0, { timeout: 20000 });
  await page.reload();
  await expect(intro).toBeVisible();
  await page.getByRole("button", { name: "오프닝 건너뛰기" }).click();
  await expect(intro).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`차고 ${width}px: 두 운전자 CTA·선택 동의·상세 접힘`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#garage");
    await expect(page.getByRole("button", { name: "직접 운전하기", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "미스터팍에게 맡기기", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^기록 설정/ })).toContainText("브라우저에만 보관");
    await expect(page.getByLabel("그래픽 품질", { exact: true })).not.toBeVisible();
    await page.locator(".launch-bay").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`garage-${width}.png`) });
  });
}

test("목표 근처 후진 시 촬영 건축물은 컷어웨이, 추적 시점과 센서는 유지한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const map = newMap("open");
  map.start = { ...mapScenario(map).goalPose, yM: 2.2 };
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page.getByLabel("맵 파일 열기").setInputFiles({ name: "reverse.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(map)) });
  await page.getByRole("button", { name: "맵 적용", exact: true }).click();
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.getByRole("button", { name: "R 기어" }).click();
  await expect(page.getByRole("button", { name: "차량 추적", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "센서 표시", exact: true }).click();
  await expect(page.getByTestId("raw-range")).toContainText("m");
  await expect(page.locator(".scene-canvas")).toHaveAttribute("data-view", "cutaway");
  await page.keyboard.down("ArrowDown");
  await expect.poll(async () => Number(await page.getByTestId("speed").innerText())).toBeGreaterThan(0);
  await page.keyboard.up("ArrowDown");
  await page.screenshot({ path: test.info().outputPath("reverse-cutaway.png") });
  await page.getByRole("button", { name: "차고", exact: true }).click();
  await expect(page.locator(".scene-canvas")).toHaveAttribute("data-view", "cinematic");
});
