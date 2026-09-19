import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
});

test("글꼴을 자체 호스팅하고 아래 문장은 스크롤 진입 후 자연스럽게 표시한다", async ({ page }) => {
  await page.goto("/#garage");
  const copy = page.locator("#experiment h2 .reveal-text");
  await expect(copy).toHaveClass(/text-pending/);
  await page.locator("#experiment").scrollIntoViewIfNeeded();
  await expect(copy).toHaveClass(/text-entered/);
  await expect(copy).toHaveCSS("opacity", "1");
  await expect(copy).toHaveCSS("filter", "none");
  await expect.poll(() => page.evaluate(() => document.fonts.check('500 16px "Pretendard Variable"'))).toBe(true);
  await expect(page.locator("#experiment h2")).toHaveCSS("font-family", /Pretendard Variable/);
  await expect(page.locator(".hero h1")).toHaveCSS("font-family", /Pretendard Variable/);
  await page.getByText("화면 설정 · AI 모델 정보",{exact:true}).click();
  await page.getByRole("checkbox",{name:"화면 움직임 줄이기"}).check();
  for (const text of await page.locator(".reveal-text").all()) {
    await expect(text).toHaveCSS("opacity", "1");
    await expect(text).toHaveCSS("animation-name", "none");
  }
  for (const line of await page.locator("h2 .reveal-line-inner").all()) {
    await expect(line).toHaveCSS("animation-name", "none");
    await expect(line).toHaveCSS("transform", "none");
  }
});

for (const width of [390, 1440]) test(`버튼 재질·터치 영역·포커스와 동의 선택을 ${width}px에서 유지한다`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#experiment");
  const primary = page.getByRole("button", { name: "미스터팍 주행 보기", exact: true });
  await expect(primary).toBeEnabled();
  await expect(primary).toHaveCSS("border-radius", "14px");
  await expect(primary).toHaveCSS("color", "rgb(23, 34, 43)");
  await expect(primary).toHaveCSS("backdrop-filter", "none");
  await primary.focus();
  await expect(primary).toHaveCSS("outline-style", "solid");
  await expect(primary).toHaveCSS("outline-width", "2px");
  await expect(page.locator(".mascot-actions button").first()).toHaveCSS("border-radius", "12px");
  for (const button of await page.locator(".mascot-actions button,.landing-shortcuts button,.record-settings-link").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: /^기록 설정/ }).click();
  const dialog = page.getByRole("dialog", { name: /어떻게 남길까요/ });
  const choices = dialog.locator(".record-choice-actions .button");
  await dialog.getByLabel("이 브라우저에 주행 기록 보관", { exact: true }).check();
  await expect(choices.nth(1)).toBeEnabled();
  const colors = await choices.evaluateAll(els => els.map(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, height: el.getBoundingClientRect().height })));
  expect(colors[0]).toEqual(colors[1]);
  await dialog.getByLabel("이 브라우저에 주행 기록 보관", { exact: true }).uncheck();
  await expect(choices.nth(1)).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("영상 로딩 실패는 콘셉트 이미지로 복구하고 정책 실행 버튼을 유지한다", async ({ page }) => {
  await page.route("**/art/mrpark-film.mp4", r => r.abort());
  await page.goto("/#experiment");
  await page.getByRole("figure", { name: "움직이는 미스터팍 캐릭터" }).scrollIntoViewIfNeeded();
  await expect(page.getByText("영상을 불러오지 못해 콘셉트 이미지를 표시해요.")).toBeVisible();
  await expect(page.locator(".mascot-poster")).not.toHaveClass(/ready/);
  await expect(page.getByRole("button", { name: "캐릭터 영상 재생" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "미스터팍 주행 보기", exact: true })).toBeEnabled();
});

test("화면 밖 영상은 일시정지하고 복귀하면 재생한다", async ({ page }) => {
  await page.goto("/#experiment");
  const video = page.locator(".mascot-film");
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
  await page.locator("#garage").scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(true);
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
});

test("오프닝 중 다른 섹션을 선택하면 자막이 따라오지 않는다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("기준 제어기 주차 시연")).toBeVisible();
  await page.getByRole("link", { name: "우리의 실험", exact: true }).click();
  await expect(page.getByLabel("기준 제어기 주차 시연")).toHaveCount(0);
  await expect(page.locator("#experiment h2")).toBeInViewport();
});
