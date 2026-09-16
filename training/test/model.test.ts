import { describe, expect, it } from "vitest";
import { buildModel } from "../src/model.js";

describe("buildModel — seed 재현성 회귀 검사", () => {
  it("같은 seed면 초기 가중치가 완전히 같다 (리뷰 지적: 이전엔 매번 달랐음)", () => {
    const modelA = buildModel(42);
    const modelB = buildModel(42);

    const weightsA = modelA.getWeights().map((w) => Array.from(w.dataSync()));
    const weightsB = modelB.getWeights().map((w) => Array.from(w.dataSync()));

    expect(weightsA).toEqual(weightsB);

    modelA.dispose();
    modelB.dispose();
  });

  it("다른 seed면 초기 가중치가 달라진다(항상 같은 값으로 굳어버린 게 아닌지 확인)", () => {
    const modelA = buildModel(1);
    const modelB = buildModel(2);

    const firstLayerA = Array.from(modelA.getWeights()[0]!.dataSync());
    const firstLayerB = Array.from(modelB.getWeights()[0]!.dataSync());

    expect(firstLayerA).not.toEqual(firstLayerB);

    modelA.dispose();
    modelB.dispose();
  });
});
