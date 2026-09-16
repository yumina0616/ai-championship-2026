import {
  vehicleFootprint,
  obbOverlap,
  type OrientedRect,
  type Pose,
  type RectObstacle,
} from "../../engine/src/index";
import { rectFullyInside } from "../../engine/src/collision";
import { makeScenario } from "./driving";
import type { TemplateId } from "./preview";

export interface ParkingMap {
  version: "parkside-map.v1";
  name: string;
  start: Pose;
  goal: OrientedRect;
  obstacles: RectObstacle[];
}
export const MAP_BYTES = 128 * 1024;
export const MAX_OBSTACLES = 24;
export function newMap(template: TemplateId): ParkingMap {
  const s = makeScenario(template);
  if (template === "pillar")
    s.obstacles.find((o) => o.id === "pillar")!.centerXM = 1.75;
  return {
    version: "parkside-map.v1",
    name: "나의 주차장",
    start: s.start,
    goal: s.goalSpace,
    obstacles: s.obstacles,
  };
}
export function mapScenario(map: ParkingMap) {
  const s = makeScenario("open"),
    g = map.goal;
  return {
    ...s,
    scenarioId: "parkside-custom-v1",
    layoutGroup: "custom",
    start: { ...map.start },
    goalSpace: { ...g },
    goalPose: {
      xM: g.centerXM - 1.3 * Math.cos(g.yawRad),
      yM: g.centerYM - 1.3 * Math.sin(g.yawRad),
      yawRad: g.yawRad,
    },
    obstacles: map.obstacles.map((o) => ({ ...o })),
  };
}
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("맵 형식이 올바르지 않아요.");
  return v as Record<string, unknown>;
};
const number = (v: unknown, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw Error("좌표·치수·각도의 허용 범위를 확인해주세요.");
  return v;
};
function pose(v: unknown): Pose {
  const p = record(v);
  return {
    xM: number(p.xM, -20, 20),
    yM: number(p.yM, -20, 20),
    yawRad: number(p.yawRad, -Math.PI, Math.PI),
  };
}
function rect(v: unknown): OrientedRect {
  const r = record(v);
  return {
    centerXM: number(r.centerXM, -20, 20),
    centerYM: number(r.centerYM, -20, 20),
    lengthM: number(r.lengthM, 0.2, 16),
    widthM: number(r.widthM, 0.2, 10),
    yawRad: number(r.yawRad, -Math.PI, Math.PI),
  };
}
// 외부 파일은 필요한 필드만 복사한다. 엔진·센서·차량 설정은 v1 고정값이다.
export function parseMap(text: string): ParkingMap {
  if (new TextEncoder().encode(text).length > MAP_BYTES)
    throw Error("맵 파일은 128 KB 이하여야 해요.");
  const r = record(JSON.parse(text));
  if (r.version !== "parkside-map.v1")
    throw Error("지원하지 않는 맵 버전이에요.");
  if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 60)
    throw Error("맵 이름은 1~60자로 입력해주세요.");
  if (!Array.isArray(r.obstacles) || r.obstacles.length > MAX_OBSTACLES)
    throw Error("장애물은 최대 24개예요.");
  const ids = new Set<string>();
  const obstacles = r.obstacles.map((value) => {
    const o = record(value);
    if (
      typeof o.id !== "string" ||
      !/^(parked|pillar|wall)(-[a-zA-Z0-9-]+)?$/.test(o.id) ||
      o.id.length > 64 ||
      ids.has(o.id)
    )
      throw Error("장애물 ID가 잘못되었거나 중복됐어요.");
    ids.add(o.id);
    const result = { ...rect(o), id: o.id };
    if (
      o.id.startsWith("parked") &&
      (result.lengthM !== 4.4 || result.widthM !== 1.8)
    )
      throw Error("주차 차량 크기는 4.4 × 1.8 m로 고정돼요.");
    return result;
  });
  const map: ParkingMap = {
    version: "parkside-map.v1",
    name: r.name.trim(),
    start: pose(r.start),
    goal: rect(r.goal),
    obstacles,
  };
  const s = mapScenario(map),
    b = s.bounds;
  const world = {
    centerXM: (b.maxX + b.minX) / 2,
    centerYM: (b.maxY + b.minY) / 2,
    lengthM: b.maxX - b.minX,
    widthM: b.maxY - b.minY,
    yawRad: 0,
  };
  const start = vehicleFootprint(s.start, s.vehicle),
    goalCar = vehicleFootprint(s.goalPose, s.vehicle);
  if (![start, map.goal, ...obstacles].every((r) => rectFullyInside(r, world)))
    throw Error("차체·목표·장애물 전체가 주차장 경계 안에 있어야 해요.");
  if (!rectFullyInside(goalCar, map.goal))
    throw Error("목표 칸이 차량보다 작아요.");
  if (obstacles.some((o) => obbOverlap(o, start)))
    throw Error("시작 차량이 장애물과 겹쳐요.");
  if (obstacles.some((o) => obbOverlap(o, map.goal)))
    throw Error("목표 칸이 장애물과 겹쳐요.");
  if (
    obstacles.some((o, i) =>
      obstacles.slice(i + 1).some((other) => obbOverlap(o, other)),
    )
  )
    throw Error("장애물끼리 겹쳐요.");
  return map;
}
export function mapError(map: ParkingMap) {
  try {
    parseMap(JSON.stringify(map));
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : "맵을 확인해주세요.";
  }
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
