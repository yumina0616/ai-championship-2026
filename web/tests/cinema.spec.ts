import { test, expect } from "@playwright/test";
import { storyCamera, chapterAt } from "../src/story";

test("자동 촬영 경로는 루프 위치와 속도가 연속이고 유한하다", () => {
  for (const narrow of [false, true]) {
    expect(storyCamera(-1, narrow)).toEqual(storyCamera(0, narrow));
    expect(storyCamera(1, narrow)).toEqual(storyCamera(0, narrow));
    expect(storyCamera(NaN, narrow)).toEqual(storyCamera(0, narrow));
    for (const boundary of [0, 1 / 3, 2 / 3, 1]) {
      const e = 1e-5;
      const a = storyCamera(boundary - e, narrow);
      const b = storyCamera(boundary, narrow);
      const c = storyCamera(boundary + e, narrow);
      for (const key of ["position", "target"] as const) {
        a[key].forEach((v, i) => {
          expect(v).toBeCloseTo(c[key][i], 2);
          expect((b[key][i] - v) / e).toBeCloseTo(
            (c[key][i] - b[key][i]) / e,
            1,
          );
        });
      }
    }
    for (let p = 0; p < 1; p += 0.01) {
      const shot = storyCamera(p, narrow);
      expect(shot.position.every(Number.isFinite)).toBe(true);
      expect(shot.position[1]).toBeGreaterThan(4);
    }
  }
  expect([0, 0.4, 0.75].map(chapterAt)).toEqual([0, 1, 2]);
  expect(storyCamera(0.1, false).position).not.toEqual(
    storyCamera(0, false).position,
  );
});

for (const width of [1440, 390]) {
  test(`자동 촬영 ${width}px: 스크롤 독립·모션 중단·같은 화면으로 운전`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "오프닝 건너뛰기" }).click();
    const hero = page.locator(".hero");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveCount(1);
    await canvas.evaluate((el) =>
      el.setAttribute("data-story-continuity", "original"),
    );
    const progress = async () =>
      Number(await hero.getAttribute("data-film-progress"));
    await expect.poll(progress).toBeGreaterThan(0);
    const before = await progress();
    await page.mouse.move(width - 30, 400);
    await page.mouse.wheel(0, 250);
    await expect
      .poll(async () => (await hero.boundingBox())!.y)
      .toBeLessThan(0);
    expect(await progress()).toBeLessThan(before + 0.3);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await hero.boundingBox())!.y).toBe(0);
    await page.getByRole("button", { name: "장식 모션 멈추기" }).click();
    const held = await progress();
    await page.waitForTimeout(500);
    expect(await progress()).toBe(held);
    await page.getByRole("button", { name: "장식 모션 켜기" }).click();
    await expect.poll(progress).toBeGreaterThan(held);
    await expect(page.locator(".hero-actions")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(page.locator(".hero-actions")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: `test-results/film-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const size = await canvas.boundingBox();
    await page.getByRole("button", { name: "바로 운전하기" }).click();
    await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
    await expect(page.getByTestId("speed")).toHaveText("0.0");
    expect((await canvas.boundingBox())!.height).toBe(size!.height);
    await expect(canvas).toHaveAttribute("data-story-continuity", "original");
    await page.screenshot({ path: `test-results/film-drive-${width}.png` });
  });
}

test("시네마틱 진입은 Canvas를 유지하며 준비 중 입력을 차단한다", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate((el) => el.setAttribute("data-continuity", "original"));
  await expect(page.locator(".opening-signature")).not.toBeVisible();
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
  await expect(page.locator(".opening-caption")).toHaveCount(0);
  await expect(page.locator(".story-chapters")).not.toBeVisible();
  await expect(page.getByLabel("공간과 센서 소개")).toBeVisible();
  await expect(page.locator(".hero")).toHaveCSS("position", "relative");
  await expect(page.getByTestId("persistent-scene")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
});
