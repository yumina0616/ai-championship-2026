// 결정론적(seed 기반) 난수 생성기. Math.random()을 쓰면 #5의 "동일 engine·seed·command
// 재실행은 완전히 같은 결과"라는 보장이 센서 노이즈에서 깨진다.

/** mulberry32 — 작고 빠른 32bit PRNG. 통계적 강도가 필요한 용도가 아니라 재현성이 목적. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller 변환으로 표준정규분포 표본을 뽑는다. */
export function nextGaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
