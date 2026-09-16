import { expect, test } from "@playwright/test";
import {
  mapScenario,
  newMap,
  parseMap,
  mapError,
  MAP_BYTES,
} from "../src/maps";
import { ParkingEngine } from "../../engine/src/index";

test("맵 템플릿 roundtrip과 실제 엔진 초기화", () => {
  for (const template of ["open", "neighbors", "pillar"] as const) {
    const map = newMap(template),
      restored = parseMap(JSON.stringify(map));
    expect(restored).toEqual(map);
    expect(() =>
      new ParkingEngine().reset(mapScenario(restored)),
    ).not.toThrow();
  }
});
test("맵 경계·겹침·치수·상한과 중복 ID를 거부", () => {
  const base = newMap("open");
  for (const mutate of [
    (m: typeof base) => {
      m.start.xM = 50;
    },
    (m: typeof base) => {
      m.start = { xM: -6, yM: 2.85, yawRad: -Math.PI / 2 };
    },
    (m: typeof base) => {
      m.goal.widthM = 1;
    },
    (m: typeof base) => {
      m.goal.yawRad = 999;
    },
    (m: typeof base) => {
      m.obstacles.push({ ...m.obstacles[0] });
    },
    (m: typeof base) => {
      m.obstacles[0].lengthM = 0;
    },
    (m: typeof base) => {
      m.obstacles = Array(25).fill(m.obstacles[0]);
    },
  ]) {
    const m = structuredClone(base);
    mutate(m);
    expect(mapError(m)).not.toBe("");
  }
  expect(() => parseMap(" ".repeat(MAP_BYTES + 1))).toThrow("128 KB");
  expect(() => parseMap('{"version":"next"}')).toThrow("버전");
});
test("편집기 숫자 조정·삭제·파일 복원과 모바일 경계", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page.getByRole("button", { name: "기둥 추가", exact: true }).click();
  await page.getByLabel("중심 X (m)", { exact: true }).fill("-4");
  await page.getByRole("button", { name: "선택 물체 삭제" }).click();
  await page.getByLabel("맵 파일 열기").setInputFiles({
    name: "map.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...newMap("open"), name: "파일에서 온 주차장" }),
    ),
  });
  await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
    "파일에서 온 주차장",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "맵 파일 내보내기", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("parkside-map.json");
  await page.getByRole("button", { name: "맵 적용", exact: true }).click();
  await expect(
    page.getByText("맵을 적용했어요.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("editor-mobile.png") });
});

test("탑뷰 포인터 드래그와 초기화", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  const start = page.locator(".map-object.start");
  await start.scrollIntoViewIfNeeded();
  const box = (await start.boundingBox())!;
  const x = page.getByLabel("중심 X (m)", { exact: true });
  const before = Number(await x.inputValue());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  expect(Number(await x.inputValue())).toBeGreaterThan(before);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "템플릿으로 초기화" }).click();
  await expect(x).toHaveValue(String(before));
  await page.screenshot({ path: test.info().outputPath("editor-desktop.png") });
});
