import { test, expect } from "@playwright/test";
import { makeScenario } from "../src/driving";
import { policySupportError, POLICY_VERSION } from "../src/policy-info";
import { parseEpisode } from "../src/episodes";

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
  await page.getByRole("radio", { name: /마스코트/ }).check();
  await page.getByRole("button", { name: "마스코트 운전 보기" }).click();
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
