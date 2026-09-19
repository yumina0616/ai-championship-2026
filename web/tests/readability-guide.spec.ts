import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) test(`안내 대비와 순차 가이드·자동 닫기·다시 보기 ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
  await page.goto("/#experiment");
  await page.getByRole("button", { name: "어떤 실험인가요?" }).click();
  const note = page.locator(".dialog-note");
  const contrast = await note.evaluate(el => {
    const style = getComputedStyle(el);
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
        const n = v / 255;
        return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
  });
  expect(contrast).toBeGreaterThan(4.5);
  await page.screenshot({ path: test.info().outputPath("about-readable.png") });
  await page.getByRole("button", { name: "알겠어요", exact: true }).click();
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
  const guide = page.getByRole("complementary", { name: "첫 운전 안내", exact: true });
  await expect(guide).toHaveAttribute("data-step", "0");
  await expect(guide.locator(".welcome-demo kbd").first()).toHaveText("D");
  await page.screenshot({ path: test.info().outputPath("visual-guide.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "D 기어", exact: true }).click();
  await expect(guide).toHaveAttribute("data-step", "1");
  await guide.getByRole("button", { name: "센서 켜보기" }).click();
  await expect(guide).toHaveAttribute("data-step", "2");
  await page.keyboard.down("ArrowUp");
  await expect(guide).toHaveCount(0);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.down("KeyS");
  await expect(page.getByTestId("speed")).toHaveText("0.0");
  await page.keyboard.up("KeyS");
  await page.getByRole("button", { name: "P 기어", exact: true }).click();
  await page.getByRole("button", { name: "조작 가이드", exact: true }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "첫 운전 안내 닫기" }).click();
  await expect(guide).toHaveCount(0);
});
