import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`Mr.Park 서비스·마스코트 이름과 안내 연결 (${width}px)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page).toHaveTitle("Mr.Park 미스터팍 — 나만의 주차 연습 공간");
    const home = page.getByRole("link", { name: "Mr.Park 미스터팍 홈" });
    await expect(home).toBeVisible();
    await expect(home).toHaveText("Mr.Park");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Mr.Park 미스터팍",
    );
    await page.screenshot({ path: test.info().outputPath("brand-landing.png") });

    await expect(
      page.getByRole("button", { name: "미스터팍에게 맡기기" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath("brand-garage.png") });

    await page.getByRole("button", { name: "어떤 실험인가요?" }).click();
    const about = page.getByRole("dialog");
    await expect(about).toContainText("AI 친구 미스터팍");
    await expect(about).toContainText("초기 모델이라 실패할 수");
    await expect(about).toContainText("동의하지 않은 주행은 서버에 전송하지");
    await expect(about).not.toContainText("임시 이름");
    await expect(page.locator("body")).not.toContainText(/parkside/i);

    await page.goto("/data-notice.html");
    await expect(page).toHaveTitle("Mr.Park 미스터팍 — 서비스·데이터 안내");
    await page.getByRole("link", { name: "← Mr.Park으로 돌아가기" }).click();
    await expect(home).toBeVisible();
  });
}
