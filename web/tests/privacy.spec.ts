import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseMap } from "../src/maps";

test("맵 공유 확인·취소·파일 최소 필드와 개인정보 이름 분리", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page
    .getByLabel("맵 이름", { exact: true })
    .fill("공개하면 안 되는 이름");
  await page.getByRole("button", { name: "맵 파일 내보내기" }).click();
  const dialog = page.getByRole("dialog", { name: "맵만 공유하기" });
  await expect(dialog).toContainText("운전 기록·센서 로그");
  await expect(page.getByLabel("공유 파일의 맵 이름")).toHaveValue(
    "공유 주차장",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "맵 파일 내보내기" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "확인 후 맵 다운로드" }).click();
  const file = await download;
  const text = await readFile((await file.path())!, "utf8");
  expect(parseMap(text).name).toBe("공유 주차장");
  expect(Object.keys(JSON.parse(text)).sort()).toEqual([
    "goal",
    "name",
    "obstacles",
    "start",
    "version",
  ]);
  expect(text).not.toContain("공개하면 안 되는 이름");
  await expect(page.getByLabel("맵 이름", { exact: true })).toHaveValue(
    "공개하면 안 되는 이름",
  );
});
test("기록 끔을 유지하고 개인 연습은 동작하며 업로드·기록은 없다", async ({
  page,
}) => {
  test.setTimeout(60000);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (["POST", "PUT", "PATCH"].includes(r.method())) writes.push(r.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#garage");
  await page.getByRole("button", { name: /^기록 설정/ }).click();
  await page.getByLabel("이 브라우저에 주행 기록 보관").uncheck();
  await page.getByRole("button", { name: "기록 없이 설정", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^기록 설정/ }).click();
  await expect(
    page.getByLabel("이 브라우저에 주행 기록 보관"),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "기록 선택 닫기" }).click();
  await page.getByRole("button", { name: "직접 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "이번 연습 마치기" }).click();
  await expect(
    page.getByText("이번 주행은 보관하지 않았어요.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "공간 바꾸기" }).click();
  await page.getByText("내 주행 기록", { exact: false }).click();
  await page.getByRole("button", { name: "기록 새로고침" }).click();
  await expect(page.locator(".episode-list li")).toHaveCount(0);
  expect(writes).toEqual([]);
});
test("개별 기록 삭제 후 새로고침해도 되살아나지 않는다", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "바로 운전하기" }).click();
  await expect(page.getByRole("button", { name: "R 기어" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "이번 연습 마치기" }).click();
  await page.getByRole("button", { name: "공간 바꾸기" }).click();
  await page.getByText("내 주행 기록", { exact: false }).click();
  await expect(page.locator(".episode-list li")).toHaveCount(1);
  await page
    .locator(".episode-list")
    .getByRole("button", { name: /기록 삭제/ })
    .click();
  await page.getByRole("button", { name: "기록 새로고침" }).click();
  await expect(page.locator(".episode-list li")).toHaveCount(0);
  await page.reload();
  await page.getByText("내 주행 기록", { exact: false }).click();
  await expect(page.locator(".episode-list li")).toHaveCount(0);
});
