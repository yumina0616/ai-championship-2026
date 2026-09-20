import { test, expect } from "@playwright/test";
import { makeScenario } from "../src/driving";
import { policySupportError, POLICY_VERSION } from "../src/policy-info";
import { parseEpisode } from "../src/episodes";

test("AI 첫 다운로드가 8초를 넘어도 로딩을 유지하고 실제 추론 시작", async ({ page }) => {
  // #17 다양한 장애물 배치로 재학습한 모델(교체 전/후 대조 실행 3회씩)로 바꾼 뒤 이 테스트가
  // 45초 예산을 넘겨 간헐적으로 실패했다 — 기존 모델은 25~33초, 새 모델은 33~42초로 일관되게
  // 더 오래 걸렸다(모델이 나빠진 게 아니라 이 시나리오에서 걸리는 실제 소요 시간이 달라짐).
  // 여유를 넉넉히 둬서(70초) 매번 관측치 이상으로 잡는다.
  test.setTimeout(70000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/src/policy.ts", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 9000));
    await route.continue();
  });
  await page.goto("/#garage");
  await page.getByRole("button", { name: "미스터팍에게 맡기기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "최대 30초" })).toBeVisible();
  await expect(page.getByRole("button", { name: "연습 마치기", exact: true })).toBeEnabled({ timeout: 30000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId("speed").innerText())).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
});

test("지원 차량·센서 규격을 확인하고 다른 입력을 거부", () => {
  const s = makeScenario("open");
  expect(policySupportError(s)).toBeNull();
  expect(
    policySupportError({ ...s, sensor: { ...s.sensor!, rayCount: 12 } }),
  ).not.toBeNull();
  expect(
    policySupportError({ ...s, vehicle: { ...s.vehicle, wheelbaseM: 3 } }),
  ).not.toBeNull();
});

test("실제 모델 추론은 관측만 사용하고 tensor를 누적하지 않는다", async ({
  page,
}) => {
  await page.goto("/#garage");
  const result = await page.evaluate(async () => {
    const path = "/tests/policy-probe.ts";
    return (await import(/* @vite-ignore */ path)).probe();
  });
  expect(result).toMatchObject({
    moved: true,
    stable: true,
    disposed: true,
    terminated: true,
  });
  expect(result.steps).toBeGreaterThan(0);
});

test("모델 손상은 실행 전에 거부한다", async ({ page }) => {
  await page.route("**/weights.bin*", (r) =>
    new URL(r.request().url()).search
      ? r.continue()
      : r.fulfill({
          body: "corrupted",
          contentType: "application/octet-stream",
        }),
  );
  await page.goto("/#garage");
  const error = await page.evaluate(async () => {
    const p = "/src/policy.ts",
      d = "/src/driving.ts";
    const { loadPolicy } = await import(/* @vite-ignore */ p);
    const { makeScenario } = await import(/* @vite-ignore */ d);
    try {
      await loadPolicy(makeScenario("open"), new AbortController().signal);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(error).toContain("체크섬");
});

test("마스코트는 수동 입력 없이 같은 엔진으로 운전하고 실패도 기록", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByRole("button", { name: "미스터팍에게 맡기기" }).click();
  await expect(page.locator(".mission-hud")).toContainText("LEARNED LIVE");
  await expect(page.getByRole("button", { name: "R 기어" })).toBeDisabled();
  await page.keyboard.press("KeyE");
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const path = "/src/episodes.ts";
          const { listEpisodes } = await import(/* @vite-ignore */ path);
          const [record] = await listEpisodes();
          return record?.steps.length ?? 0;
        }),
      { timeout: 15000 },
    )
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = "/src/episodes.ts";
        return (await (await import(/* @vite-ignore */ path)).listEpisodes())[0]
          ?.footer.logComplete;
      }),
    )
    .toBe(true);
  const text = await page.evaluate(async () => {
    const path = "/src/episodes.ts";
    const { listEpisodes } = await import(/* @vite-ignore */ path);
    return JSON.stringify((await listEpisodes())[0]);
  });
  const record = parseEpisode(text);
  expect(record.header.controllerKind).toBe("learned");
  expect(record.header.policyVersion).toBe(POLICY_VERSION);
  expect(record.steps.length).toBeGreaterThan(1);
  expect(
    record.steps.every(
      (s) => s.rawInput.inputs.length === 0 && s.rawInput.analogSteer === null,
    ),
  ).toBe(true);
  expect(record.header.scenarioSnapshot).toEqual(makeScenario("open"));
  expect(record.footer.terminationReason).toBe("user_abort");
});
