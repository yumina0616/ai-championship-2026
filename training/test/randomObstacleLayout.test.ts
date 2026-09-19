import { describe, expect, it } from "vitest";
import { generateRandomObstacles, DEFAULT_RANDOM_LAYOUT_OPTIONS } from "../src/randomObstacleLayout";
import { makeScenario } from "../../web/src/scenario";
import { createRng, obbOverlap, rectFullyInside, vehicleFootprint } from "../../engine/src/index";

describe("generateRandomObstacles", () => {
  it("같은 rng 시퀀스면 항상 같은 배치가 나온다(재현성)", () => {
    const scenario = makeScenario("open");
    const a = generateRandomObstacles(scenario, createRng(42));
    const b = generateRandomObstacles(scenario, createRng(42));
    expect(a).toEqual(b);
  });

  it("옵션 범위 안의 개수만큼 장애물을 만든다", () => {
    const scenario = makeScenario("open");
    const obstacles = generateRandomObstacles(scenario, createRng(1), { minObstacles: 3, maxObstacles: 3 });
    expect(obstacles.length).toBeLessThanOrEqual(3);
    expect(obstacles.length).toBeGreaterThan(0); // 이 시드에서 최소 하나는 자리를 찾아야 정상
  });

  it("생성된 장애물은 전부 맵 경계 안에 있다", () => {
    const scenario = makeScenario("pillar");
    const world = {
      centerXM: (scenario.bounds.minX + scenario.bounds.maxX) / 2,
      centerYM: (scenario.bounds.minY + scenario.bounds.maxY) / 2,
      lengthM: scenario.bounds.maxX - scenario.bounds.minX,
      widthM: scenario.bounds.maxY - scenario.bounds.minY,
      yawRad: 0,
    };
    for (let seed = 0; seed < 10; seed++) {
      const obstacles = generateRandomObstacles(scenario, createRng(seed));
      for (const o of obstacles) expect(rectFullyInside(o, world)).toBe(true);
    }
  });

  it("생성된 장애물은 시작 footprint와 겹치지 않는다", () => {
    const scenario = makeScenario("open");
    const startFootprint = vehicleFootprint(scenario.start, scenario.vehicle);
    for (let seed = 0; seed < 10; seed++) {
      const obstacles = generateRandomObstacles(scenario, createRng(seed));
      for (const o of obstacles) expect(obbOverlap(o, startFootprint)).toBe(false);
    }
  });

  it("생성된 장애물은 목표 공간과 겹치지 않는다", () => {
    const scenario = makeScenario("open");
    for (let seed = 0; seed < 10; seed++) {
      const obstacles = generateRandomObstacles(scenario, createRng(seed));
      for (const o of obstacles) expect(obbOverlap(o, scenario.goalSpace)).toBe(false);
    }
  });

  it("생성된 장애물끼리도, 기존 장애물과도 서로 겹치지 않는다", () => {
    const scenario = makeScenario("neighbors"); // 기존 장애물이 이미 여러 개 있는 맵
    for (let seed = 0; seed < 10; seed++) {
      const obstacles = generateRandomObstacles(scenario, createRng(seed), { minObstacles: 4, maxObstacles: 4 });
      const all = [...scenario.obstacles, ...obstacles];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          expect(obbOverlap(all[i]!, all[j]!)).toBe(false);
        }
      }
    }
  });

  it("기본 옵션값이 합리적인 범위다", () => {
    expect(DEFAULT_RANDOM_LAYOUT_OPTIONS.minObstacles).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_RANDOM_LAYOUT_OPTIONS.maxObstacles).toBeGreaterThanOrEqual(DEFAULT_RANDOM_LAYOUT_OPTIONS.minObstacles);
    expect(DEFAULT_RANDOM_LAYOUT_OPTIONS.minSizeM).toBeGreaterThan(0);
    expect(DEFAULT_RANDOM_LAYOUT_OPTIONS.maxSizeM).toBeGreaterThanOrEqual(DEFAULT_RANDOM_LAYOUT_OPTIONS.minSizeM);
  });
});
