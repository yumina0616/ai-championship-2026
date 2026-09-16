import { describe, expect, it } from "vitest";
import { computeFinalErrors } from "../src/evaluate.js";

describe("computeFinalErrors — yaw 경계 회귀 검사", () => {
  it("일반적인(경계를 안 넘는) 각도 차이는 그대로 계산된다", () => {
    const { yawErrorRad } = computeFinalErrors(
      { xM: 0, yM: 0, yawRad: 0.1 },
      { xM: 0, yM: 0, yawRad: 0.3 }
    );
    expect(yawErrorRad).toBeCloseTo(0.2, 9);
  });

  it("-pi/+pi 경계를 넘는 자세는 정규화 없이 빼면 거의 2*pi가 되는 문제를 겪었다 — 이제는 작은 값이어야 한다", () => {
    // 리뷰에서 지적된 실제 사례와 같은 모양: 한쪽은 -pi 근처, 다른 쪽은 +pi 근처.
    const { yawErrorRad } = computeFinalErrors(
      { xM: 0, yM: 0, yawRad: -3.13 },
      { xM: 0, yM: 0, yawRad: 3.13 }
    );
    // 실제 각도 차이는 2*pi - 6.26 ≈ 0.023이어야 한다. 정규화를 안 했다면 6.26 근처가 나왔을 것.
    expect(yawErrorRad).toBeLessThan(0.1);
  });

  it("위치 오차는 두 pose 사이 유클리드 거리다", () => {
    const { positionErrorM } = computeFinalErrors(
      { xM: 0, yM: 0, yawRad: 0 },
      { xM: 3, yM: 4, yawRad: 0 }
    );
    expect(positionErrorM).toBeCloseTo(5, 9);
  });
});
