import { useRef, useState } from "react";
import { vehicleFootprint, type OrientedRect } from "../../engine/src/index";
import {
  MAP_BYTES,
  mapError,
  mapScenario,
  MAX_OBSTACLES,
  newMap,
  parseMap,
  type ParkingMap,
} from "./maps";
import type { TemplateId } from "./preview";
import "./workbench.css";
import MapShare from "./MapShare";

export default function MapEditor({
  template,
  initialMap,
  onApply,
}: {
  template: TemplateId;
  initialMap?: ParkingMap | null;
  onApply: (map: ParkingMap) => void;
}) {
  const [map, setMap] = useState(() =>
    structuredClone(initialMap ?? newMap(template)),
  );
  const [selected, select] = useState("start");
  const [notice, setNotice] = useState("");
  const [sharing, setSharing] = useState<ParkingMap | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    rect: OrientedRect;
  } | null>(null);
  const s = mapScenario(map),
    error = mapError(map);
  const items = [
    {
      id: "start",
      label: "시작 차량",
      ...vehicleFootprint(map.start, s.vehicle),
    },
    { id: "goal", label: "목표 칸", ...map.goal },
    ...map.obstacles.map((o) => ({
      ...o,
      label: o.id.startsWith("parked")
        ? "주차 차량"
        : o.id.startsWith("wall")
          ? "벽"
          : "기둥",
    })),
  ];
  const current = items.find((o) => o.id === selected) ?? items[0];
  function update(change: Partial<OrientedRect>) {
    const r = { ...current, ...change };
    setNotice("");
    setMap((m) =>
      current.id === "start"
        ? {
            ...m,
            start: {
              xM: r.centerXM - 1.3 * Math.cos(r.yawRad),
              yM: r.centerYM - 1.3 * Math.sin(r.yawRad),
              yawRad: r.yawRad,
            },
          }
        : current.id === "goal"
          ? { ...m, goal: r }
          : {
              ...m,
              obstacles: m.obstacles.map((o) =>
                o.id === current.id ? { ...o, ...change } : o,
              ),
            },
    );
  }
  function add(kind: "wall" | "pillar" | "parked") {
    const id = kind + "-" + crypto.randomUUID();
    setMap((m) => ({
      ...m,
      obstacles: [
        ...m.obstacles,
        {
          id,
          centerXM: -3.5,
          centerYM: -2,
          lengthM: kind === "parked" ? 4.4 : kind === "wall" ? 2 : 0.6,
          widthM: kind === "parked" ? 1.8 : 0.6,
          yawRad: 0,
        },
      ],
    }));
    select(id);
    setNotice("");
  }
  return (
    <details
      className="workbench"
      onToggle={() => {
        drag.current = null;
      }}
    >
      <summary>
        나만의 주차장 만들기 <span>MAP STUDIO / 미터 단위</span>
      </summary>
      <p>
        탑뷰에서 물체를 끌거나 아래 숫자를 바꾸세요. 16.4 × 10.4 m · 차량 4.4 ×
        1.8 m · 장애물 최대 24개. 유효한 배치라도 주차 가능성을 보장하지 않아요.
      </p>
      <label>
        맵 이름{" "}
        <input
          maxLength={60}
          value={map.name}
          onChange={(e) => setMap({ ...map, name: e.target.value })}
        />
      </label>
      <div className="editor-layout">
        <svg
          className="map-canvas"
          viewBox="-8.5 -4.65 17 11"
          aria-label="주차장 탑뷰"
          onPointerMove={(e) => {
            if (!drag.current || drag.current.id !== e.pointerId) return;
            const matrix = e.currentTarget.getScreenCTM();
            if (!matrix) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
              matrix.inverse(),
            );
            update({
              centerXM:
                Math.round(
                  (drag.current.rect.centerXM + p.x - drag.current.x) * 10,
                ) / 10,
              centerYM:
                Math.round(
                  (drag.current.rect.centerYM - p.y + drag.current.y) * 10,
                ) / 10,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id="map-meter-grid"
              width="1"
              height="1"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 1 0 L 0 0 0 1"
                fill="none"
                stroke="#343737"
                strokeWidth=".02"
              />
            </pattern>
          </defs>
          <rect
            x="-8.2"
            y="-4.35"
            width="16.4"
            height="10.4"
            fill="url(#map-meter-grid)"
            stroke="#7b8282"
            strokeWidth=".04"
          />
          {items.map((o) => (
            <g
              key={o.id}
              transform={`translate(${o.centerXM} ${-o.centerYM}) rotate(${(-o.yawRad * 180) / Math.PI})`}
              className={
                "map-object " +
                (o.id === selected ? "selected " : "") +
                (o.id === "goal"
                  ? "goal"
                  : o.id === "start"
                    ? "start"
                    : "obstacle")
              }
              onPointerDown={(e) => {
                select(o.id);
                const svg = e.currentTarget.ownerSVGElement!;
                const matrix = svg.getScreenCTM();
                if (!matrix) return;
                const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
                  matrix.inverse(),
                );
                drag.current = { id: e.pointerId, x: p.x, y: p.y, rect: o };
                svg.setPointerCapture(e.pointerId);
              }}
            >
              <rect
                x={-o.lengthM / 2}
                y={-o.widthM / 2}
                width={o.lengthM}
                height={o.widthM}
                rx=".06"
                strokeWidth=".06"
              />
              <path
                d={`M ${o.lengthM / 2 - 0.5} -.22 l .25 .22 l -.25 .22`}
                fill="none"
                stroke="currentColor"
                strokeWidth=".08"
              />
            </g>
          ))}
        </svg>
        <div className="editor-inspector">
          <label>
            선택한 물체{" "}
            <select value={current.id} onChange={(e) => select(e.target.value)}>
              {items.map((o, i) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {i > 1 ? ` ${i - 1}` : ""}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["centerXM", "중심 X (m)"],
              ["centerYM", "중심 Y (m)"],
              ["yawRad", "방향 (°)"],
              ["lengthM", "길이 (m)"],
              ["widthM", "폭 (m)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step={key === "yawRad" ? 5 : 0.1}
                min={
                  key === "yawRad"
                    ? -180
                    : key.endsWith("M") &&
                        (key === "lengthM" || key === "widthM")
                      ? 0.2
                      : -20
                }
                max={key === "yawRad" ? 180 : 20}
                value={Number(
                  (
                    current[key] * (key === "yawRad" ? 180 / Math.PI : 1)
                  ).toFixed(3),
                )}
                disabled={
                  (current.id === "start" || current.id.startsWith("parked")) &&
                  (key === "lengthM" || key === "widthM")
                }
                onChange={(e) => {
                  if (Number.isFinite(e.target.valueAsNumber))
                    update({
                      [key]:
                        e.target.valueAsNumber *
                        (key === "yawRad" ? Math.PI / 180 : 1),
                    });
                }}
              />
            </label>
          ))}
          <button
            disabled={selected === "start" || selected === "goal"}
            onClick={() => {
              setMap((m) => ({
                ...m,
                obstacles: m.obstacles.filter((o) => o.id !== selected),
              }));
              select("start");
            }}
          >
            선택 물체 삭제
          </button>
        </div>
      </div>
      <div className="workbench-actions">
        {(
          [
            ["wall", "벽 추가"],
            ["pillar", "기둥 추가"],
            ["parked", "차량 추가"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            disabled={map.obstacles.length >= MAX_OBSTACLES}
            onClick={() => add(kind)}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            if (
              window.confirm(
                "편집 내용을 지우고 선택한 템플릿으로 초기화할까요?",
              )
            ) {
              setMap(newMap(template));
              select("start");
              setNotice("");
            }
          }}
        >
          템플릿으로 초기화
        </button>
      </div>
      <p role="status">
        {error ||
          notice ||
          "배치 검사 통과 · 드래그는 0.1 m 간격으로 이동해요."}
      </p>
      <div className="workbench-actions">
        <button
          disabled={!!error}
          onClick={() => {
            onApply(parseMap(JSON.stringify(map)));
            setNotice("맵을 적용했어요.");
          }}
        >
          맵 적용
        </button>
        <button
          disabled={!!error}
          onClick={() => setSharing(parseMap(JSON.stringify(map)))}
        >
          맵 파일 내보내기
        </button>
        <label className="file-button">
          맵 파일 열기
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > MAP_BYTES)
                  throw Error("맵 파일은 128 KB 이하여야 해요.");
                const next = parseMap(await file.text());
                setMap(next);
                select("start");
                setNotice("파일을 열었어요. 적용하기 전에 배치를 확인하세요.");
              } catch (err) {
                setNotice(
                  err instanceof Error ? err.message : "파일을 열지 못했어요.",
                );
              }
            }}
          />
        </label>
      </div>
      {sharing && <MapShare map={sharing} onClose={() => setSharing(null)} />}
    </details>
  );
}
