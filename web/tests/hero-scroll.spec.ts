import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`상단 3D는 ${width}px 스크롤 중에도 소개 구간으로 새지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "오프닝 건너뛰기" }).click();
    await expect(page.locator(".world-stage canvas")).toHaveCount(1);

    for (const fraction of [.25, .8, 1.2, .65, 0]) {
      const bounds = await page.evaluate((fraction) => {
        const hero = document.querySelector(".hero")!;
        window.scrollTo({ top: hero.getBoundingClientRect().height * fraction, behavior: "instant" });
        // scroll 이벤트/React 렌더/다음 RAF 이전에도 두 면이 맞아야 한다.
        const scene = document.querySelector(".world-stage")!.getBoundingClientRect();
        const heading = hero.getBoundingClientRect();
        const next = document.querySelector(".design-manifesto")!.getBoundingClientRect();
        return { topGap: scene.top - heading.top, bottomGap: scene.bottom - heading.bottom, overlap: scene.bottom - next.top };
      }, fraction);
      expect(Math.abs(bounds.topGap)).toBeLessThan(1);
      expect(Math.abs(bounds.bottomGap)).toBeLessThan(1);
      expect(bounds.overlap).toBeLessThanOrEqual(1);
    }

    await page.getByRole("link", { name: "다른 공간 고르기", exact: true }).click();
    await expect(page.getByRole("button", { name: "직접 운전하기", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
    await expect(page.getByTestId("persistent-scene")).toHaveCSS("position", "fixed");
    await expect(page.getByTestId("persistent-scene")).toHaveCSS("top", "0px");
  });
}
