import { test, expect } from "@playwright/test";

test("시네마틱 진입은 Canvas를 유지하며 준비 중 입력을 차단한다", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate((el) => el.setAttribute("data-continuity", "original"));
  await expect(page.locator(".opening-signature")).toHaveCSS(
    "visibility",
    "hidden",
  );
  await page.screenshot({ path: "test-results/cinema-landing.png" });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/runtime.json", async (route) => {
    await ready;
    await route.fulfill({ json: { kind: "browser-engine", version: 1 } });
  });
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeDisabled();
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyW");
  await expect(page.getByTestId("sim-time")).toHaveText("0.0 s");
  await expect(page.getByTestId("speed")).toHaveText("0.0");
  await expect(canvas).toHaveAttribute("data-continuity", "original");
  release();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(page.locator(".mission-hud h1")).toBeFocused();
  await expect(canvas).toHaveCount(1);
  await page.screenshot({ path: "test-results/cinema-drive.png" });
  await page.getByRole("button", { name: "차고", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "이 공간에서 시작" }),
  ).toBeFocused();
  await expect(canvas).toHaveAttribute("data-continuity", "original");
  await expect(page.locator(".opening-signature")).toHaveCount(0);
});

test("감소된 모션에서는 오프닝과 레이아웃 이동을 생략한다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".opening-signature")).not.toBeVisible();
  await expect(page.getByTestId("persistent-scene")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
});
