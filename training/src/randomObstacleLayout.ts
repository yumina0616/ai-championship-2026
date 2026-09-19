// #17 (과적합 해결 1단계): 학습 데이터가 "시작 위치는 100번 흔들지만 장애물 배치는 3개 맵
// 전부 고정"이라, 모델이 "이 특정 배치에서 목표까지 가는 법"은 배웠어도 "장애물이 다르게
// 있을 때 피하는 법"은 한 번도 학습 못 했다(실제 커스텀 맵 테스트로 확인됨). 시작 위치뿐
// 아니라 장애물 배치 자체를 무작위로 다양화해서 학습 데이터를 만들기 위한 첫 단계 —
// web/src/maps.ts의 지도 에디터 검증 로직(겹침 없음, 경계 안)과 같은 기준을 재사용한다.
import {
  obbOverlap,
  rectFullyInside,
  vehicleFootprint,
  type OrientedRect,
  type RectObstacle,
  type Scenario,
} from "../../engine/src/index.js";

export interface RandomLayoutOptions {
  /** 이 범위 안에서 장애물 개수를 무작위로 정한다(둘 다 포함). */
  minObstacles: number;
  maxObstacles: number;
  /** 장애물 한 변의 길이 범위(m). */
  minSizeM: number;
  maxSizeM: number;
  /** 시작/목표 footprint 주변에 이만큼 여유(m)를 두고는 장애물을 안 놓는다 — 처음부터 못
   * 빠져나가는 배치를 줄이기 위함(그래도 100% 방지는 아니라 Hybrid A* 실행 가능성 확인은
   * 여전히 필요하다). */
  clearanceM: number;
  /** 장애물 하나를 놓는 데 이만큼 시도해도 자리를 못 찾으면 그 장애물은 포기한다. */
  maxAttemptsPerObstacle: number;
}

export const DEFAULT_RANDOM_LAYOUT_OPTIONS: RandomLayoutOptions = {
  minObstacles: 1,
  maxObstacles: 4,
  minSizeM: 0.3,
  maxSizeM: 2.0,
  clearanceM: 0.5,
  maxAttemptsPerObstacle: 40,
};

function expand(rect: OrientedRect, marginM: number): OrientedRect {
  return { ...rect, lengthM: rect.lengthM + 2 * marginM, widthM: rect.widthM + 2 * marginM };
}

/**
 * 기존 장애물(scenario.obstacles)은 그대로 두고, 시작/목표/기존 장애물과 안 겹치는 새 장애물을
 * 무작위로 추가 생성한다. rng가 같으면 항상 같은 배치가 나온다(재현성). 반환값은 "새로 추가된"
 * 장애물만이다 — 실제 시나리오에 쓰려면 [...scenario.obstacles, ...generated]로 합친다.
 */
export function generateRandomObstacles(
  scenario: Scenario,
  rng: () => number,
  options: Partial<RandomLayoutOptions> = {}
): RectObstacle[] {
  const opts = { ...DEFAULT_RANDOM_LAYOUT_OPTIONS, ...options };
  const count = opts.minObstacles + Math.floor(rng() * (opts.maxObstacles - opts.minObstacles + 1));

  const world: OrientedRect = {
    centerXM: (scenario.bounds.minX + scenario.bounds.maxX) / 2,
    centerYM: (scenario.bounds.minY + scenario.bounds.maxY) / 2,
    lengthM: scenario.bounds.maxX - scenario.bounds.minX,
    widthM: scenario.bounds.maxY - scenario.bounds.minY,
    yawRad: 0,
  };
  const startZone = expand(vehicleFootprint(scenario.start, scenario.vehicle), opts.clearanceM);
  const goalZone = expand(scenario.goalSpace, opts.clearanceM);
  const existing: OrientedRect[] = scenario.obstacles;

  const placed: RectObstacle[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < opts.maxAttemptsPerObstacle; attempt++) {
      const lengthM = opts.minSizeM + rng() * (opts.maxSizeM - opts.minSizeM);
      const widthM = opts.minSizeM + rng() * (opts.maxSizeM - opts.minSizeM);
      const yawRad = rng() * Math.PI * 2;
      const centerXM = scenario.bounds.minX + rng() * (scenario.bounds.maxX - scenario.bounds.minX);
      const centerYM = scenario.bounds.minY + rng() * (scenario.bounds.maxY - scenario.bounds.minY);
      const candidate: RectObstacle = { id: `random-${i}`, centerXM, centerYM, lengthM, widthM, yawRad };

      if (!rectFullyInside(candidate, world)) continue;
      if (obbOverlap(candidate, startZone)) continue;
      if (obbOverlap(candidate, goalZone)) continue;
      if (existing.some((o) => obbOverlap(candidate, o))) continue;
      if (placed.some((p) => obbOverlap(candidate, p))) continue;

      placed.push(candidate);
      break;
    }
  }
  return placed;
}
