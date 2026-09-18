import { test, expect } from "@playwright/test";
import { newMap, mapScenario } from "../src/maps";
import { ParkingEngine } from "../../engine/src/index";

test("편집 장애물은 실제 센서와 충돌에 사용되고 snapshot은 분리된다", () => {
  const m = newMap("open");
  m.obstacles.push({
    id: "wall-test",
    centerXM: 4.5,
    centerYM: -3.7,
    lengthM: 0.4,
    widthM: 2,
    yawRad: 0,
  });
  const s = mapScenario(m),
    engine = new ParkingEngine();
  const observation = engine.reset(structuredClone(s));
  const front = observation.sensors.find((r) => Math.abs(r.angleRad) < 0.01)!;
  expect(front.rangeM).toBeCloseTo(2.8);
  m.obstacles = [];
  expect(s.obstacles).toHaveLength(3);
  let last;
  for (let i = 0; i < 40; i++) {
    last = engine.step({ targetSpeedMps: 1, targetSteeringRad: 0 });
    if (last.outcome.terminated) break;
  }
  expect(last!.outcome.reason).toBe("collision");
});
test("가져온 맵 목표에서 성공·재시작하고 기본 템플릿으로 복귀", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const m = newMap("open");
  m.start = { ...mapScenario(m).goalPose };
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page
    .getByLabel("맵 파일 열기")
    .setInputFiles({
      name: "goal.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(m)),
    });
  await page.getByRole("button", { name: "맵 적용", exact: true }).click();
  await page
    .getByRole("button", { name: "직접 운전하기", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "NICE PARK." })).toBeVisible({
    timeout: 25000,
  });
  await expect(page.locator(".workbench")).toHaveCount(0);
  await page
    .getByRole("button", { name: "같은 공간 다시 도전", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "NICE PARK." })).toBeVisible({
    timeout: 25000,
  });
  await page.getByRole("button", { name: "공간 바꾸기", exact: true }).click();
  await page.getByRole("radio", { name: "여유로운 첫 주차" }).check();
  await expect(page.getByText("적용한 맵:", { exact: false })).toHaveCount(0);
});
