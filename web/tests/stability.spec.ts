import { test, expect } from "@playwright/test";

test("그래픽 품질은 렌더 해상도만 바꾸고 설정을 보관한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("화면 설정 · AI 모델 정보", { exact: true }).click();
  const quality = page.getByLabel("그래픽 품질", { exact: true });
  await quality.selectOption("high");
  const canvas = page.locator(".world-stage canvas");
  await expect(canvas).toHaveCount(1);
  const ratio = () =>
    canvas.evaluate((c) => (c as HTMLCanvasElement).width / c.clientWidth);
  await expect.poll(ratio).toBeGreaterThanOrEqual(0.99);
  await quality.selectOption("low");
  await expect.poll(ratio).toBeLessThan(0.8);
  await page.reload();
  await page.getByText("화면 설정 · AI 모델 정보", { exact: true }).click();
  await expect(quality).toHaveValue("low");
  await page.getByRole("button", { name: "직접 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.getByRole("button", { name: "센서 표시", exact: true }).click();
  await expect(page.getByTestId("raw-range")).toContainText("m");
});
test("주행 도중 WebGL 손실은 입력을 중단하고 다시 준비할 수 있다", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page
    .locator("canvas")
    .evaluate((c) =>
      c.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.getByRole("alert")).toContainText("3D 화면");
  await expect(page.getByRole("button", { name: "D 기어" })).toBeDisabled();
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(1);
});
