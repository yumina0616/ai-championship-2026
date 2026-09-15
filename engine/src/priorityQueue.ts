// Hybrid A* open set용 최소 이진 힙. 노드 수가 수천~수만이 될 수 있어 배열 선형탐색은 너무 느리다.
export class MinHeap<T> {
  private items: Array<{ priority: number; value: T }> = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, value: T): void {
    this.items.push({ priority, value });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top.value;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.priority <= this.items[i]!.priority) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.items[left]!.priority < this.items[smallest]!.priority) smallest = left;
      if (right < n && this.items[right]!.priority < this.items[smallest]!.priority) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!];
      i = smallest;
    }
  }
}
