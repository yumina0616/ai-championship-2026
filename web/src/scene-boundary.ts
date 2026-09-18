import { footprintOutOfBounds, type Scenario, type StepResult, type WorldBounds } from "../../engine/src/index";

type Position = [number, number, number];
/** 안쪽 면이 물리 bounds와 일치하는 연석. Three.js 좌표 = (x, 높이, -y). */
export function boundaryCurbs(bounds: WorldBounds) {
  const thickness = .4, width = bounds.maxX - bounds.minX, depth = bounds.maxY - bounds.minY;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = -(bounds.minY + bounds.maxY) / 2;
  return [
    { id: "west", position: [bounds.minX - thickness / 2, .3, cz] as Position, size: [thickness, .45, depth] as Position },
    { id: "east", position: [bounds.maxX + thickness / 2, .3, cz] as Position, size: [thickness, .45, depth] as Position },
    { id: "north", position: [cx, .3, -bounds.maxY - thickness / 2] as Position, size: [width + thickness * 2, .45, thickness] as Position },
    { id: "south", position: [cx, .3, -bounds.minY + thickness / 2] as Position, size: [width + thickness * 2, .45, thickness] as Position },
  ];
}

/** UI 설명 전용. 종료 코드와 정책 입력/학습 계약은 변경하지 않는다. */
export function outsideDrivingArea(result: StepResult | null, scenario: Scenario) {
  return result?.outcome.reason === "collision" && footprintOutOfBounds(result.poseTruth, scenario.vehicle, scenario.bounds);
}
