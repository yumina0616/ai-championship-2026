import { test, expect } from "@playwright/test";
import { NOTICE_VERSION } from "../src/collection-record";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
});

test("첫 운전은 선택 전 실행/기록하지 않고, 취소·기록 없이 시작·재방문을 지원한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const posts: string[] = [];
  page.on("request", r => { if (r.method() === "POST") posts.push(r.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  const dialog = page.getByRole("dialog", { name: /어떻게 남길까요/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("이 브라우저에 주행 기록 보관", { exact: true })).not.toBeChecked();
  await expect(dialog.getByLabel("학습용 기록 전송에 동의하고 켜기")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "D 기어" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("mrpark-record-choice"))).toBeNull();
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await page.getByRole("button", { name: "기록 없이 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await expect(page.getByText("이번 주행은 보관하지 않았어요.", { exact: false })).toBeVisible();
  expect(posts).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(dialog).toHaveCount(0);
});

test("첫 선택 직후의 첫 주행부터 동의한 기록만 저장·전송하고 설정 취소는 변경하지 않는다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const uploads: unknown[] = [];
  await page.route("**/api/collection", r => r.fulfill({ json: { enabled: true, noticeVersion: NOTICE_VERSION } }));
  await page.route("**/api/episodes", async r => { uploads.push(r.request().postDataJSON()); await r.fulfill({ json: { stored: true } }); });
  await page.goto("/#garage");
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /어떻게 남길까요/ });
  await dialog.getByLabel("학습용 기록 전송에 동의하고 켜기").check();
  await expect(dialog.getByLabel("이 브라우저에 주행 기록 보관", { exact: true })).toBeChecked();
  expect(uploads).toHaveLength(0);
  await page.getByRole("button", { name: "선택하고 시작하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect.poll(async () => parseFloat(await page.getByTestId("sim-time").innerText())).toBeGreaterThan(.1);
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await expect.poll(() => uploads.length).toBe(1);
  await page.getByRole("button", { name: "공간 바꾸기", exact: true }).click();
  await page.getByRole("button", { name: /^기록 설정/ }).click();
  await dialog.getByLabel("학습용 기록 전송에 동의하고 켜기").uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^기록 설정/ })).toContainText("학습 전송 켜짐");
});

test("미스터팍 첫 진입도 선택 창을 거쳐 선택한 AI 모드로 시작한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByRole("button", { name: "미스터팍에게 맡기기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /어떻게 남길까요/ })).toBeVisible();
  await page.getByRole("button", { name: "기록 없이 시작", exact: true }).click();
  await expect(page.locator(".mission-hud")).toContainText("LEARNED LIVE", { timeout: 30000 });
  await expect(page.getByRole("button", { name: "D 기어" })).toBeDisabled();
});

for (const width of [390, 1440]) test(`기록 창 ${width}px와 조작판 접기·입력 해제·키보드 운전`, async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/#garage");
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /어떻게 남길까요/ });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`record-${width}.png`) });
  await page.getByRole("button", { name: "기록 없이 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("KeyW");
  await expect(page.getByRole("button", { name: "액셀", exact: true })).toHaveAttribute("aria-pressed", "true");
  const height = (await page.locator("#cockpit").boundingBox())!.height;
  await page.getByRole("button", { name: "조작판 접기" }).click();
  await expect(page.locator(".input-button.throttle")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("KeyW");
  await expect(page.getByRole("button", { name: "조작판 펼치기" })).toHaveAttribute("aria-expanded", "false");
  expect((await page.locator("#cockpit").boundingBox())!.height).toBeLessThan(height * .65);
  await expect(page.getByRole("button", { name: "일시정지", exact: true })).toBeVisible();
  await page.locator(".mission-hud h1").focus();
  await page.keyboard.down("KeyW");
  await expect(page.locator(".input-button.throttle")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("KeyW");
  await page.screenshot({ path: test.info().outputPath(`cockpit-${width}.png`) });
  await page.getByRole("button", { name: "조작판 펼치기" }).click();
  await expect(page.getByRole("button", { name: "액셀", exact: true })).toBeVisible();
});

test("스크롤 필름이 이동하고 버튼 중심에 반응하며 모션 중단을 따른다", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/#garage");
  const spatial = page.locator(".continuous-backdrop");
  await page.locator("#garage").scrollIntoViewIfNeeded();
  await expect(spatial).toHaveAttribute("data-visible", "true");
  await expect.poll(async () => Number(await spatial.getAttribute("data-phase"))).toBeGreaterThan(.1);
  const phaseBefore = Number(await spatial.getAttribute("data-phase"));
  await page.mouse.wheel(0, 260);
  await expect.poll(async () => Number(await spatial.getAttribute("data-phase"))).toBeGreaterThan(phaseBefore + .02);
  const card = page.locator(".mission").nth(1);
  await card.click();
  await expect(spatial).toHaveAttribute("data-reaction", "active");
  const cardRect = (await card.boundingBox())!;
  expect(Math.abs(Number(await spatial.getAttribute("data-origin-x")) - (cardRect.x + cardRect.width / 2))).toBeLessThan(4);
  await expect(page.getByRole("radio", { name: "옆 차 사이로 쏙" })).toBeChecked();
  await expect(page.locator(".click-feedback-plane")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("spatial-reaction.png") });
  await expect(spatial).toHaveAttribute("data-reaction", "idle", { timeout: 5000 });
  await page.getByText("화면 설정 · AI 모델 정보",{exact:true}).click();
  await page.getByRole("checkbox",{name:"화면 움직임 줄이기"}).check();
  await expect(spatial).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: /^기록 설정/ }).click();
  await expect(spatial).toHaveAttribute("data-reaction", "idle");
  await expect(page.locator(".click-feedback-plane")).toHaveCount(0);
});

test("배경은 모션 감소에서 정지하고 운전 진입 시 제거되며 주행 Canvas를 유지한다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#garage");
  const spatial = page.locator(".continuous-backdrop");
  await expect(spatial).toHaveAttribute("data-motion", "paused");
  await page.getByRole("radio", { name: "기둥 옆 한 자리" }).check();
  await expect(spatial).toHaveAttribute("data-reaction", "idle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("spatial-mobile.png") });
  await page.getByRole("button", { name: "직접 운전하기", exact: true }).click();
  await page.getByRole("button", { name: "기록 없이 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(page.locator(".continuous-backdrop")).toHaveCount(0);
  await expect(page.locator(".world-stage canvas")).toHaveCount(1);
});
