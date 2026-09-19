import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page) {
  await page.bringToFront();
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  // 리소스 자체 timeout(8초)과 두 WebGL 탭의 소프트웨어 렌더 지연을 포함합니다.
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled({
    timeout: 20_000,
  });
  await expect(page.locator(".mission-hud h1")).toBeFocused();
}
async function brake(page: Page) {
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyS");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBe(0);
  await page.waitForTimeout(150);
  await page.keyboard.up("KeyS");
}

test("기어 단축키·시점 유지와 수동 후방 선택·드래그 조향·센서 원시값", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await enter(page);
  await page.keyboard.press("KeyQ");
  await expect(page.getByRole("button", { name: "R 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "차량 추적", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const rear = page.getByRole("button", { name: "후방 시점", exact: true });
  await expect(rear).toHaveAttribute("aria-pressed", "false");
  await rear.click();
  await expect(rear).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("button", { name: "D 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rear).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("KeyP");
  await expect(rear).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("KeyQ");
  await expect(rear).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "차량 추적", exact: true }).click();
  const wheel = page.getByRole("slider", { name: "드래그 핸들" });
  const box = (await wheel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2, {
    steps: 5,
  });
  await expect
    .poll(async () => Number(await wheel.getAttribute("aria-valuenow")))
    .toBeLessThan(-10);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await wheel.getAttribute("aria-valuenow")))
    .toBe(0);
  await page.getByRole("button", { name: "센서 표시", exact: true }).click();
  await expect(page.getByTestId("raw-range")).toContainText("m");
  const before = await page.getByTestId("raw-range").innerText();
  await page.keyboard.press("KeyE");
  await page.keyboard.down("KeyW");
  await expect(
    page.getByRole("button", { name: "차량 추적", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // #17: 맵 경계도 센서로 감지하게 되면서(engine/src/sensor.ts) 중심 원시 최소값이 옆쪽 경계처럼
  // 전진만으로는 잘 안 바뀌는 값에 붙들릴 수 있다 — 값이 실제로 갱신될 시간을 명시적으로 준다.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("raw-range")).not.toHaveText(before);
  await brake(page);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(page.getByLabel("실시간 가상 센서")).toContainText("HOLD");
});

test("실제 멀티터치 이벤트로 핸들과 페달을 동시에 유지하고 해제", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.keyboard.press("KeyE");
  const wheel = page.getByRole("slider", { name: "드래그 핸들" });
  const w = (await wheel.boundingBox())!,
    p = (await page
      .getByRole("button", { name: "액셀", exact: true })
      .boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const hand = { id: 1, x: w.x + w.width / 2, y: w.y + 45 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [hand],
  });
  hand.x += 55;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [hand],
  });
  await expect
    .poll(async () => Number(await wheel.getAttribute("aria-valuenow")))
    .toBeLessThan(-10);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [hand, { id: 2, x: p.x + p.width / 2, y: p.y + p.height / 2 }],
  });
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0.2);
  await expect
    .poll(async () => Number(await wheel.getAttribute("aria-valuenow")))
    .toBeLessThan(-10);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.getByRole("button", { name: "액셀", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => Number(await wheel.getAttribute("aria-valuenow")))
    .toBe(0);
  await cdp.detach();
});

test("센서 경고음은 동의한 재생 중에만 예약되고 일시정지·음소거 시 중단", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const stats = { starts: 0, active: 0, closed: 0, pauseOnStart: true };
    Object.assign(window, { audioStats: stats });
    class FakeAudioContext {
      state = "running";
      destination = {};
      get currentTime() {
        return performance.now() / 1000;
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        stats.closed++;
        return Promise.resolve();
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {},
          disconnect() {},
        };
      }
      createOscillator() {
        let active = false;
        return {
          type: "sine",
          frequency: { value: 0 },
          connect() {},
          disconnect() {
            if (active) {
              stats.active--;
              active = false;
            }
          },
          start() {
            stats.starts++;
            stats.active++;
            active = true;
            if (stats.pauseOnStart) {
              stats.pauseOnStart = false;
              queueMicrotask(() => window.dispatchEvent(new Event("blur")));
            }
          },
          stop() {},
        };
      }
    }
    Object.assign(window, { AudioContext: FakeAudioContext });
  });
  await enter(page);
  const stats = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            audioStats: { starts: number; active: number; closed: number };
          }
        ).audioStats,
    );
  expect((await stats()).starts).toBe(0);
  await page.getByRole("button", { name: "센서 경고음" }).click();
  await page.keyboard.press("KeyE");
  await page.keyboard.down("KeyA");
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => (await stats()).starts, { timeout: 12000 })
    .toBeGreaterThan(0);
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  await expect(
    page.getByRole("heading", { name: "잠시 멈춰도 괜찮아." }),
  ).toBeVisible();
  const paused = (await stats()).starts;
  await page.waitForTimeout(850);
  expect((await stats()).starts).toBe(paused);
  expect((await stats()).active).toBe(0);
  await page.getByRole("button", { name: "차고", exact: true }).click();
  expect((await stats()).closed).toBe(1);
  await page.getByRole("button", { name: "이 공간에서 시작" }).click();
  await expect(page.locator(".mission-hud h1")).toBeFocused();
  await page.getByRole("button", { name: "센서 경고음" }).click();
  await page.getByRole("button", { name: "센서 경고음" }).click();
  const muted = (await stats()).starts;
  await page.keyboard.press("KeyE");
  await page.keyboard.down("KeyA");
  await page.keyboard.down("KeyW");
  await expect(page.getByRole("heading", { name: "TRY AGAIN." })).toBeVisible({
    timeout: 15000,
  });
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyW");
  expect((await stats()).starts).toBe(muted);
  expect((await stats()).active).toBe(0);
  await page.getByRole("button", { name: "차고", exact: true }).click();
  expect((await stats()).closed).toBe(2);
});

test("랜딩·차고 선택·키보드·모델 준비 상태·가이드", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "조작 영역으로 바로가기" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "오프닝 건너뛰기" }).click();
  await expect(
    page.getByRole("heading", { name: "주차를 플레이하다." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("radio", { name: "여유로운 첫 주차" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "옆 차 사이로 쏙" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: /미스터팍/ }).check();
  await expect(
    page.getByRole("button", { name: "미스터팍 운전 보기" }),
  ).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("0/1");
  await page.getByRole("button", { name: "조작 가이드" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "조작 가이드" })).toBeFocused();
  await page.getByRole("radio", { name: "직접 운전", exact: true }).check();
  await page.getByRole("radio", { name: "여유로운 첫 주차" }).check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/landing.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("P 고정·D 액셀·이동 중 변속 거부·브레이크·R 후진", async ({ page }) => {
  test.setTimeout(60_000);
  await enter(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(300);
  expect(await page.getByTestId("speed").innerText()).toBe("0.0");
  await page.keyboard.up("KeyW");
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0.4);
  await page.keyboard.press("KeyQ");
  await page.keyboard.up("KeyW");
  await expect(page.getByRole("button", { name: "D 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("status")).toContainText("먼저 브레이크");
  await brake(page);
  await page.getByRole("button", { name: "R 기어" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyA");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0.3);
  await expect(page.locator(".wheel-display>span")).not.toHaveText("조향 0°");
  await page.keyboard.up("KeyA");
  await brake(page);
  await page.getByRole("button", { name: "P 기어" }).click();
  await expect(page.getByRole("button", { name: "P 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "센서 표시", exact: true }).click();
  await page.getByRole("button", { name: "탑뷰", exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/drive.png" });
});

test("창 이탈·Space 일시정지·결과·재시작 입력 초기화", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.up("KeyW");
  await expect(
    page.getByRole("heading", { name: "잠시 멈춰도 괜찮아." }),
  ).toBeVisible();
  const time = await page.getByTestId("sim-time").innerText();
  await page.waitForTimeout(250);
  expect(await page.getByTestId("sim-time").innerText()).toBe(time);
  await page.getByRole("button", { name: "계속 운전하기" }).click();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "잠시 멈춰도 괜찮아." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이번 연습 마치기" }).click();
  await expect(page.getByText("직접 종료", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "같은 공간 다시 도전" }).click();
  await expect(page.getByRole("button", { name: "P 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(300);
  expect(await page.getByTestId("speed").innerText()).toBe("0.0");
  await page.getByRole("button", { name: "차고", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "이 공간에서 시작" }),
  ).toBeFocused();
});

test("초기 리소스 실패·재시도·늦은 응답 취소", async ({ page }) => {
  await page.route("**/runtime.json", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("alert")).toContainText("인터넷 연결");
  await page.unroute("**/runtime.json");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await page.getByRole("button", { name: "차고", exact: true }).click();
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/runtime.json", async (r) => {
    await responseGate;
    await r
      .fulfill({ json: { kind: "browser-engine", version: 1 } })
      .catch(() => {});
  });
  await page.getByRole("button", { name: "이 공간에서 시작" }).click();
  await page.getByRole("button", { name: "불러오기 취소" }).click();
  releaseResponse();
  await page.waitForTimeout(650);
  await expect(page.locator(".drive-screen")).toHaveCount(0);
});

test("8초 timeout은 재시도를 제공", async ({ page }) => {
  await page.route("**/runtime.json", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 9500));
    await r
      .fulfill({ json: { kind: "browser-engine", version: 1 } })
      .catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("alert")).toContainText("응답이 늦어지고", {
    timeout: 10000,
  });
});

test("모바일 터치·조작과 차량 동시 노출·가로 넘침 없음", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(900);
  expect(
    await page.locator("#hero-title").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().right <= innerWidth;
    }),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-landing.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("radio", { name: "기둥 옆 한 자리" }).check();
  await page.getByRole("button", { name: "이 공간에서 시작" }).click();
  await page.getByRole("button", { name: "D 기어" }).click();
  const throttle = page.getByRole("button", { name: "액셀", exact: true });
  const box = await throttle.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0);
  await page.mouse.up();
  await expect(throttle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".notice-panel")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/mobile-pause.png" });
  await page.getByRole("button", { name: "계속 운전하기" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/mobile-drive.png" });
});

test("감소된 모션 설정에서도 진입·카메라 전환 가능", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  await page.getByRole("button", { name: "탑뷰", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "탑뷰", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .locator(".cockpit")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});

test("두 탭의 차량·기어 상태는 독립", async ({ page, context }) => {
  test.setTimeout(60_000);
  await enter(page);
  await page.getByRole("button", { name: "R 기어" }).click();
  const second = await context.newPage();
  await enter(second);
  await expect(second.getByRole("button", { name: "P 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "R 기어" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await second.close();
});

test("실제 경계 충돌은 성공이 아닌 실패 결과로 표시", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "D 기어" }).click();
  await page.keyboard.down("KeyW");
  await expect(page.getByRole("heading", { name: "TRY AGAIN." })).toBeVisible({
    timeout: 15000,
  });
  await page.keyboard.up("KeyW");
  await expect(page.getByText("충돌", { exact: true })).toBeVisible();
  await expect(page.locator(".result-panel")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/result.png" });
});

test("WebGL 실패 시 차량 실행을 중단하고 오류를 표시", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("alert")).toContainText("3D 화면");
  await expect(page.getByRole("button", { name: "D 기어" })).toBeDisabled();
  const time = await page.getByTestId("sim-time").innerText();
  await page.waitForTimeout(200);
  expect(await page.getByTestId("sim-time").innerText()).toBe(time);
});
