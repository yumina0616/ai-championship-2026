import { expect, test } from "@playwright/test";
import { BODY_SECTIONS, coachworkGeometry } from "../src/DesignObjects";
import { boardingPose } from "../src/BoardingRobot";
import { openingShot } from "../src/opening";
import { monitorRect } from "../src/CameraMonitor";

test("기술 필름 컷과 탑승 동작의 경계·문 닫힘을 유지한다", () => {
  expect([0, .26, .51, .76, 1].map(openingShot)).toEqual([0, 1, 2, 3, 3]);
  expect(boardingPose(0)).toMatchObject({ visible: true, door: 0 });
  expect(boardingPose(2).door).toBeCloseTo(.85);
  expect(boardingPose(4.2)).toMatchObject({ visible: false, door: 0 });
  for (const width of [390, 1440]) {
    const rect = monitorRect(width, 844);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThan(width);
    expect(rect.bottom + rect.height + rect.y).toBe(844);
  }
});

test("미스터팍 탑승 중에는 엔진 입력이 잠기고 완료 후 실제 정책을 시작한다", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
  await page.goto("/#garage");
  await expect(page.getByLabel("기준 제어기 주차 시연")).toHaveCount(0);
  await page.getByRole("button", { name: "미스터팍에게 맡기기" }).click();
  await expect(page.getByRole("heading", { name: "미스터팍, 운전 부탁해." })).toBeVisible();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeDisabled();
  await expect(page.getByTestId("speed")).toHaveText("0.0");
  await expect(page.getByRole("button", { name: "연습 마치기", exact: true })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator(".mission-hud")).toContainText("LEARNED LIVE");
  await expect.poll(async () => parseFloat(await page.getByTestId("sim-time").innerText())).toBeGreaterThan(0);
});

test("첫 운전 안내·운전석·후방 카메라·미러는 같은 Canvas에서 동작한다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  const guide = page.getByRole("complementary", { name: "첫 운전 안내", exact: true });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "다음", exact: true }).click();
  await guide.getByRole("button", { name: "센서 켜보기" }).click();
  await expect(page.getByRole("button", { name: "센서 표시", exact: true })).toHaveAttribute("aria-pressed", "true");
  await guide.getByRole("button", { name: "출발해볼게요" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "운전석", exact: true }).click();
  await page.getByRole("button", { name: "후방 카메라", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-monitor", "rear");
  await page.getByRole("button", { name: "사이드 미러", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-monitor", "mirror");
  await page.screenshot({ path: test.info().outputPath("driver-mirror.png") });
  await page.getByRole("button", { name: "보조 카메라 닫기" }).click();
  await expect(page.locator("canvas")).not.toHaveAttribute("data-monitor");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(guide).toHaveCount(0);
});

test("3D 작업대와 기술 설명은 상호작용하며 좁은 화면에서도 넘치지 않는다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await expect(page.getByLabel("3D 주차장 작업대").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "기둥 추가", exact: true }).click();
  await page.getByLabel("중심 X (m)", { exact: true }).fill("-4");
  await expect(page.getByLabel("중심 X (m)", { exact: true })).toHaveValue("-4");
  await page.getByLabel("3D 주차장 작업대").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("map-studio-mobile.png") });
  const lab = page.getByLabel("차량 기술 살펴보기");
  await lab.scrollIntoViewIfNeeded();
  await lab.getByRole("button", { name: "02센서" }).click();
  await expect(lab.locator("canvas")).toBeVisible();
  await expect(lab.locator(".lab-reading")).toContainText("m");
  await lab.getByRole("button", { name: "03조향" }).click();
  await lab.getByLabel("차체 설명 조향각").fill("15");
  await expect(lab.getByLabel("차체 설명 조향각")).toHaveValue("15");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("자체 제작 경량 차체는 4.4 × 1.8m 표시 영역과 유한 법선을 유지한다", () => {
  const geometry = coachworkGeometry(BODY_SECTIONS);
  const bounds = geometry.boundingBox!;
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(4.4);
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(1.8);
  for (const name of ["position", "normal"]) {
    expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
  }
  expect(geometry.index!.count).toBeGreaterThan(0);
  geometry.dispose();
});

test("고화질 차량을 같은 Canvas에 표시하고 출처·콘셉트 구분을 제공한다", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "high"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  const canvas = page.locator(".world-stage canvas");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-vehicle-asset", "detailed", { timeout: 45_000 });
  await page.screenshot({ path: test.info().outputPath("art-direction-desktop.png") });
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(canvas).toHaveAttribute("data-vehicle-asset", "detailed");
  await expect(canvas).toHaveCount(1);
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => Number(await page.getByTestId("speed").textContent())).toBeGreaterThan(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
  await page.goto("/credits.html");
  await expect(page.getByRole("link", { name: "CC BY 4.0 라이선스" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
});

test("차량 파일 실패 시에도 전체 3D나 운전 기능이 중단되지 않는다", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "high"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/models/car-concept.glb", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect(page.getByText("3D 화면을 열지 못했어요.")).not.toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => Number(await page.getByTestId("speed").textContent())).toBeGreaterThan(0);
  await page.keyboard.up("ArrowUp");
});

test("390px에서도 콘셉트 이미지·동의·조작이 가로 넘침 없이 유지된다", async ({ page }) => {
  let carRequests = 0;
  page.on("request", req => { if (req.url().endsWith("car-concept.glb")) carRequests++; });
  await page.addInitScript(() => localStorage.setItem("parkside-quality", "low"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".scene-canvas")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("art-direction-mobile.png") });
  await page.locator("#experiment").scrollIntoViewIfNeeded();
  const image = page.getByRole("img", { name: /미스터팍의 디자인 콘셉트/ });
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.getByText("AI 생성 브랜드 필름 · 실제 주행 화면이 아니에요.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(carRequests).toBe(0);
  await page.screenshot({ path: test.info().outputPath("art-direction-mascot.png") });
  await expect(page.getByRole("button", { name: /^기록 설정/ })).toContainText("브라우저에만 보관");
});
