import { describe, expect, it } from "vitest";
import { seededShuffle } from "../src/train.js";

describe("seededShuffle — 재현성 회귀 검사", () => {
  it("같은 seed면 항상 같은 순서로 섞인다", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = seededShuffle(items, 42);
    const b = seededShuffle(items, 42);
    expect(a).toEqual(b);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const items = [1, 2, 3, 4, 5];
    const original = [...items];
    seededShuffle(items, 1);
    expect(items).toEqual(original);
  });

  it("다른 seed면 대체로 다른 순서가 나온다", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = seededShuffle(items, 1);
    const b = seededShuffle(items, 2);
    expect(a).not.toEqual(b);
  });

  it("셔플 후에도 같은 원소 집합을 유지한다(빠지거나 중복 안 됨)", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = seededShuffle(items, 7);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });
});
