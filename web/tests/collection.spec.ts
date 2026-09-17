import { test, expect } from "@playwright/test";
import { NOTICE_VERSION } from "../src/collection-record";

async function finish(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "이 공간에서 시작", exact: true }).click();
  await expect(page.getByRole("button", { name: "D 기어" })).toBeEnabled();
  await expect.poll(async () => Number(await page.getByTestId("speed").innerText())).toBe(0);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "연습 마치기", exact: true }).click();
  await page.getByRole("button", { name: "공간 바꾸기", exact: true }).click();
}
test("기본 업로드 없음 → 한 번 동의 후 다음 기록만 자동 전송 → 새로고침 유지 → 끄기·삭제", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const uploaded: unknown[] = [], deleted: string[] = [];
  await page.route("**/api/collection", r => r.fulfill({ json: { enabled: true, noticeVersion: NOTICE_VERSION } }));
  await page.route("**/api/episodes", async r => {
    if (r.request().method() === "DELETE") deleted.push(r.request().headers().authorization);
    else uploaded.push(r.request().postDataJSON());
    await r.fulfill({ status: 200, json: { stored: true, deleted: true } });
  });
  await page.goto("/#garage");
  const choice = page.getByRole("checkbox", { name: "학습용 기록 전송에 동의하고 켜기" });
  await expect(choice).not.toBeChecked();
  await finish(page);
  expect(uploaded).toHaveLength(0);
  await choice.check();
  expect(uploaded).toHaveLength(0); // 과거 기록 소급 전송 금지
  await finish(page);
  await expect.poll(() => uploaded.length).toBe(1);
  expect(JSON.stringify(uploaded)).not.toMatch(/startedAt|episodeId|wallTimestamp/);
  await page.reload();
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await finish(page);
  expect(uploaded).toHaveLength(1);
  await page.getByRole("button", { name: "전송 끄고 이 브라우저의 서버 기록 삭제" }).click();
  await expect.poll(() => deleted.length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mr-park-learning-receipts")!))).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("collection-settings.png") });
});
test("서버 닫힘/버전 변경에는 기존 동의도 적용하지 않는다", async ({ page }) => {
  await page.addInitScript(v => localStorage.setItem("mr-park-learning-consent", v), NOTICE_VERSION);
  await page.route("**/api/collection", r => r.fulfill({ json: { enabled: true, noticeVersion: "next" } }));
  await page.goto("/#garage");
  const choice = page.getByRole("checkbox", { name: "학습용 기록 전송에 동의하고 켜기" });
  await expect(choice).toBeDisabled();
  await expect(choice).not.toBeChecked();
});
