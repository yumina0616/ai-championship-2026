import { test, expect } from "@playwright/test";
import { ParkingEngine } from "../../engine/src/index";
import { goalOutline, makeScenario } from "../src/driving";
import { parkingMessage } from "../src/ParkingFeedback";

test("웹 v2의 44cm 오차 주차는 실제 성공하고 영역 밖/역방향은 거부한다", () => {
  for (const template of ["open", "neighbors", "pillar"] as const) {
    const s = makeScenario(template);
    s.start = { ...s.goalPose, xM: s.goalPose.xM - 0.44 };
    const engine = new ParkingEngine();
    engine.reset(s);
    expect(engine.getParkingStatus()).toMatchObject({
      ready: true,
      inside: true,
    });
    let result;
    for (let i = 0; i < 30; i++) {
      result = engine.step({ targetSpeedMps: 0, targetSteeringRad: 0 });
      if (result.outcome.terminated) break;
    }
    expect(result!.outcome.reason).toBe("success");
    expect(engine.getParkingStatus()!.heldForS).toBe(1);
    s.start = { ...s.goalPose, yM: s.goalPose.yM - 0.44 };
    engine.reset(s);
    expect(engine.getParkingStatus()!.ready).toBe(true);
    s.start = { ...s.goalPose, yM: s.goalPose.yM - 0.51 };
    engine.reset(s);
    expect(engine.getParkingStatus()!.inside).toBe(false);
    expect(parkingMessage(engine.getParkingStatus()!)).toContain("칸 안");
    s.start = {
      xM: s.goalPose.xM,
      yM: s.goalSpace.centerYM - 1.3,
      yawRad: Math.PI / 2,
    };
    engine.reset(s);
    expect(engine.getParkingStatus()).toMatchObject({
      inside: true,
      angleOk: false,
      ready: false,
    });
    expect(parkingMessage(engine.getParkingStatus()!)).toContain("방향과 각도");
  }
});

test("화면 목표선은 회전한 goalSpace의 정확한 네 모서리를 사용한다", () => {
  for (const yawRad of [-Math.PI / 2, 0, 0.7]) {
    const space = { ...makeScenario("open").goalSpace, yawRad, centerXM: 1.2 };
    const points = goalOutline(space);
    expect(points[0]).toEqual(points[4]);
    for (const [x, height, z] of points) {
      const dx = x - space.centerXM,
        dy = -z - space.centerYM;
      expect(height).toBe(0.18);
      expect(
        Math.abs(dx * Math.cos(yawRad) + dy * Math.sin(yawRad)),
      ).toBeCloseTo(space.lengthM / 2);
      expect(
        Math.abs(-dx * Math.sin(yawRad) + dy * Math.cos(yawRad)),
      ).toBeCloseTo(space.widthM / 2);
    }
  }
});

for (const width of [1440, 390]) {
  test(`주차 안내 ${width}px: 부족한 조건과 시간 초과 이유를 표시한다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 대기만 줄인다. 실제 시작 위치·판정·시뮬레이션 시간은 엔진을 사용한다.
    await page.route(/\/src\/scenario\.ts(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      expect(body).toContain("timeoutSimS: 90");
      await route.fulfill({
        response,
        body: body.replace("timeoutSimS: 90", "timeoutSimS: 5"),
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "바로 운전하기" }).click();
    const feedback = page.getByRole("complementary", {
      name: "주차 성공 조건",
    });
    await expect(feedback).toContainText("차체 전체를 표시된 칸 안으로");
    await expect(feedback).toContainText("각도 미충족");
    await expect(feedback).toContainText("정지 충족");
    // 초기 Canvas 준비 전 검은 프레임이 아닌 실제 진행 중 화면을 캡처한다.
    await expect
      .poll(async () =>
        parseFloat(await page.getByTestId("sim-time").innerText()),
      )
      .toBeGreaterThan(0.5);
    await page.screenshot({
      path: `test-results/parking-feedback-${width}.png`,
    });
    await expect(page.getByRole("heading", { name: "TIME UP." })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".parking-timeout-reason")).toContainText(
      "차체 전체를 표시된 칸 안으로",
    );
    await expect(
      page.getByRole("heading", { name: "NICE PARK." }),
    ).not.toBeVisible();
  });

  test(`주차 성공 ${width}px: 실제 엔진 확인 → P 선택 → 성공 결과`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    // 테스트에서만 시작점을 주차칸 안 44cm 오프셋으로 둔다. 엔진/결과/타이머는 대역으로 바꾸지 않는다.
    await page.route(/\/src\/scenario\.ts(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const original = "start: { xM: 0.2, yM: -3.7, yawRad: 0 }";
      expect(body).toContain(original);
      await route.fulfill({
        response,
        body: body.replace(
          original,
          "start: { xM: 0.44, yM: 2.9, yawRad: -Math.PI / 2 }",
        ),
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "바로 운전하기" }).click();
    await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.keyboard.press("KeyQ");
    await expect(
      page.getByRole("heading", { name: "주차 조건을 충족했어요." }),
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: `test-results/parking-confirm-${width}.png`,
    });
    await page.getByRole("button", { name: "P로 마무리" }).click();
    await expect(
      page.getByRole("heading", { name: "NICE PARK." }),
    ).toBeVisible();
    await expect(page.locator(".result-metrics")).toContainText("성공");
    await page.screenshot({
      path: `test-results/parking-success-${width}.png`,
    });
    await page.getByRole("button", { name: "같은 공간 다시 도전" }).click();
    await expect(
      page.getByRole("heading", { name: "NICE PARK." }),
    ).not.toBeVisible();
  });
}
