import { test, expect } from "@playwright/test";

test("개발 테스트도 동의 전에는 전송하지 않고 합성 fixture만 요청한다", async ({
  page,
}) => {
  const posts: unknown[] = [],
    authorizations: string[] = [];
  const id = "synthetic-id",
    token = "local-test-only-token";
  await page.route("**/api/local-contributions**", async (route) => {
    const r = route.request();
    if (r.method() === "POST") {
      posts.push(r.postDataJSON());
      await route.fulfill({
        json: { id, token, expiresAt: Date.now() + 3600000 },
        status: 201,
      });
    } else if (r.url().endsWith(id)) {
      authorizations.push(r.headers().authorization);
      await route.fulfill({
        json:
          r.method() === "DELETE"
            ? { deleted: true }
            : {
                source: "synthetic-test",
                episode: { steps: Array(5).fill(null) },
              },
      });
    } else
      await route.fulfill({
        json: {
          mode: "synthetic-only",
          consentVersion: "local-synthetic.v1",
          retentionSeconds: 3600,
        },
      });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("개발 전용 기여 테스트", { exact: false }).click();
  const send = page.getByRole("button", { name: "합성 기록 저장 테스트" });
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "로컬 API 확인" }).click();
  await expect(send).toBeDisabled();
  expect(posts).toEqual([]);
  await page
    .getByLabel("합성 기록의 로컬 테스트 저장에 동의해요", { exact: false })
    .check();
  await send.click();
  await expect(
    page.getByRole("button", { name: "내 테스트 기록 확인" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "내 테스트 기록 확인" }).click();
  await expect(
    page.getByText("내 합성 기록 5 step 확인", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "테스트 동의 철회와 삭제" }).click();
  await expect(
    page.getByText("로컬 서버 합성 기록을 삭제했어요.", { exact: false }),
  ).toBeVisible();
  expect(posts).toEqual([
    {
      fixture: "stationary.v1",
      consent: true,
      consentVersion: "local-synthetic.v1",
    },
  ]);
  expect(authorizations).toEqual([`Bearer ${token}`, `Bearer ${token}`]);
  await expect(send).toBeDisabled();
});
