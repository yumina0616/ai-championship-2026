import { test, expect } from "@playwright/test";
import { newMap, mapLink, mapFromHash, MAP_LINK_LIMIT } from "../src/maps";

test("링크는 필요한 맵만 복원하고 손상·크기·추가 필드를 거부/제거", () => {
  const map = newMap("open");
  map.name = "우리 연습장 🚗";
  const url = mapLink(
    { ...map, privateRecord: "secret" } as typeof map,
    "https://example.test/sub/?private=abc",
  );
  expect(new URL(url).search).toBe("");
  expect(mapFromHash(new URL(url).hash)).toEqual(map);
  expect(decodeURIComponent(url)).not.toContain("secret");
  expect(mapFromHash("#garage")).toBeNull();
  expect(() => mapFromHash("#map=%%%")).toThrow();
  expect(() => mapFromHash("#map=" + "a".repeat(MAP_LINK_LIMIT + 1))).toThrow();
});
test("링크를 확인한 뒤 적용하고 사람·마스코트에 같은 맵을 제공", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (["POST", "PUT", "PATCH"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/#garage");
  await page.getByText("나만의 주차장 만들기", { exact: false }).click();
  await page.getByRole("button", { name: "맵 파일 내보내기" }).click();
  await page.getByRole("button", { name: "확인 후 링크 만들기" }).click();
  const link = await page.getByLabel("공유 링크", { exact: true }).inputValue();
  await page.goto(link);
  const incoming = page.getByRole("region", { name: "받은 공유 맵" });
  await expect(incoming).toContainText("공유 주차장");
  await expect(page.getByText("적용한 맵:", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "확인 후 이 맵 적용" }).click();
  await expect(
    page.getByText("적용한 맵: 공유 주차장", { exact: false }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /미스터팍/ }).check();
  await expect(
    page.getByRole("button", { name: "미스터팍 운전 보기" }),
  ).toBeEnabled();
  expect(writes).toEqual([]);
});
