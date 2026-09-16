import { test, expect } from "@playwright/test";

test("정적 배포 artifact에서 실제 가중치 추론·기록과 개발 API 제거 확인", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const weights: number[] = [],
    uploads: string[] = [];
  page.on("response", (r) => {
    if (/weights-.*\.bin$/.test(r.url())) weights.push(r.status());
  });
  page.on("request", (r) => {
    if (r.method() === "POST") uploads.push(r.url());
  });
  await page.goto("/#garage");
  await expect(
    page.getByText("개발 전용 기여 테스트", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: /마스코트/ }).check();
  await page.getByRole("button", { name: "마스코트 운전 보기" }).click();
  await expect(page.locator(".mission-hud")).toContainText("LEARNED LIVE");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").innerText()))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await page.getByRole("button", { name: "공간 바꾸기" }).click();
  await page.getByText("내 주행 기록", { exact: false }).click();
  await expect(page.locator(".episode-list")).toContainText("AI");
  await expect(page.locator(".episode-list")).toContainText("user_abort");
  expect(weights).toEqual([200]);
  expect(uploads).toEqual([]);
});
