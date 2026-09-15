import { describe, expect, it } from "vitest";
import { MinHeap } from "../src/priorityQueue.js";

describe("MinHeap", () => {
  it("항상 가장 작은 priority부터 pop한다", () => {
    const heap = new MinHeap<string>();
    heap.push(5, "five");
    heap.push(1, "one");
    heap.push(3, "three");
    heap.push(2, "two");
    heap.push(4, "four");
    const order = [heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()];
    expect(order).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("비어있으면 undefined를 반환한다", () => {
    const heap = new MinHeap<number>();
    expect(heap.pop()).toBeUndefined();
  });

  it("size가 push/pop에 따라 정확히 갱신된다", () => {
    const heap = new MinHeap<number>();
    expect(heap.size).toBe(0);
    heap.push(1, 100);
    heap.push(2, 200);
    expect(heap.size).toBe(2);
    heap.pop();
    expect(heap.size).toBe(1);
  });

  it("무작위로 넣어도 정렬된 순서로 나온다(대량)", () => {
    const heap = new MinHeap<number>();
    const values = Array.from({ length: 500 }, () => Math.floor(Math.random() * 10000));
    for (const v of values) heap.push(v, v);
    const popped: number[] = [];
    while (heap.size > 0) popped.push(heap.pop()!);
    expect(popped).toEqual([...values].sort((a, b) => a - b));
  });
});
