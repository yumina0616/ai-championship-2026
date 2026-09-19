import { test, expect } from "@playwright/test";

test("R 아래키 액셀·위키 브레이크, 동시 액셀 키를 독립적으로 해제", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled({
    timeout: 10_000,
  });
  await page.keyboard.press("KeyQ");
  const pedal = page.getByRole("button", { name: "액셀", exact: true });
  const speed = () => page.getByTestId("speed").innerText().then(Number);
  await expect(pedal).toContainText("↓ / W");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.down("KeyW");
  await page.keyboard.up("KeyW");
  await expect(pedal).toHaveAttribute("aria-pressed", "true");
  await expect.poll(speed).toBeGreaterThan(0.4);
  await page.keyboard.up("ArrowDown");
  await expect(pedal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("ArrowUp");
  await expect.poll(speed).toBe(0);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(150);
  await page.keyboard.press("KeyE");
  await expect(pedal).toContainText("↑ / W");
  await page.keyboard.down("ArrowUp");
  await expect.poll(speed).toBeGreaterThan(0.4);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.down("ArrowDown");
  await expect.poll(speed).toBe(0);
  await page.keyboard.up("ArrowDown");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const time = await page.getByTestId("sim-time").innerText();
  await page.waitForTimeout(300);
  expect(await page.getByTestId("sim-time").innerText()).toBe(time);
});

for (const width of [1440, 390]) {
  test(`주차 오프닝 ${width}px: 자동 종료·같은 Canvas·수동 기록 분리`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const caption = page.getByLabel("기준 제어기 주차 시연");
    await expect(caption).toContainText("학습 AI 아님");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveCount(1);
    await canvas.evaluate((el) =>
      el.setAttribute("data-opening-continuity", "original"),
    );
    await expect(page.locator(".opening-signature")).not.toBeVisible();
    await page.screenshot({ path: `test-results/opening-${width}.png` });
    await expect(caption).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () =>
        Number(await page.locator(".hero").getAttribute("data-film-progress")),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "바로 운전하기" }).click();
    await expect(page.getByRole("button", { name: "P 기어" })).toBeEnabled({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "P 기어" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("speed")).toHaveText("0.0");
    await expect(canvas).toHaveAttribute("data-opening-continuity", "original");
    await expect(page.getByRole("heading", { name: "TRY AGAIN." })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "센서 표시", exact: true }).click();
    // #17: 맵 경계도 센서로 감지하도록 바뀌면서(engine/src/sensor.ts) 이 시작 자세의 중심 원시
    // 최소값이 장애물(4.74m)이 아니라 더 가까운 맵 경계(2.35m)로 바뀌었다 — 실제 동작 변화다.
    await expect(page.getByTestId("raw-range")).toContainText("2.35");
    await page.screenshot({ path: `test-results/smooth-drive-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
