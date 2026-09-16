import { comparisonError, episodeFooter, type LocalEpisode } from "./episodes";

export default function EpisodeCompare({
  records,
  onRemove,
}: {
  records: LocalEpisode[];
  onRemove: (id: string) => void;
}) {
  if (!records.length) return null;
  const mismatch =
    records.length === 2
      ? comparisonError(records[0], records[1])
      : "비교할 다른 기록을 하나 더 선택해주세요.";
  const metrics = records.map((e) =>
    episodeFooter(e, e.footer.terminationReason),
  );
  const scenario = records[0].header.scenarioSnapshot;
  const rows: [string, (m: ReturnType<typeof episodeFooter>) => string][] = [
    ["성공", (m) => (m.success ? "성공" : "성공 아님")],
    ["충돌", (m) => (m.collided ? "충돌" : "기록 없음")],
    ["종료 사유", (m) => m.terminationReason ?? "미종료"],
    ["기록 완전성", (m) => (m.logComplete ? "정상 종료 기록" : "불완전 기록")],
    ["시뮬레이션 시간", (m) => `${m.totalSimTimeS.toFixed(2)} s`],
    ["이동 거리", (m) => `${m.distanceTraveledM.toFixed(2)} m`],
    ["전진·후진 전환", (m) => `${m.directionChanges}회`],
    [
      "최종 위치 오차",
      (m) =>
        m.finalPositionErrorM === null
          ? "미측정"
          : `${m.finalPositionErrorM.toFixed(2)} m`,
    ],
    [
      "최종 각도 오차",
      (m) =>
        m.finalYawErrorRad === null
          ? "미측정"
          : `${((m.finalYawErrorRad * 180) / Math.PI).toFixed(2)}°`,
    ],
  ];
  return (
    <section className="record-player episode-compare" aria-label="시도 비교">
      <h3>같은 공간, 서로 다른 시도</h3>
      <p>
        선택한 {records.length}회 전체 결과예요. 실패·중단도 포함하며 우승
        점수나 통계적 성능 개선을 뜻하지 않아요.
      </p>
      <p>
        사람은 탑뷰·도움을 볼 수 있고 정책은 거리 센서와 이상적 위치 기반 상대
        목표를 받아요. 같은 환경이어도 정보가 동일한 공정 벤치마크는 아니에요.
      </p>
      {mismatch && <p role="status">{mismatch}</p>}
      <div className="comparison-scroll">
        <table>
          <caption>
            {mismatch
              ? "각 기록의 개별 결과"
              : "동일 초기조건 확인 · 저장 step으로 다시 계산한 지표"}
          </caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              {records.map((e, i) => (
                <th scope="col" key={e.header.episodeId}>
                  {i === 0 ? "A" : "B"} ·{" "}
                  {e.header.controllerKind === "human"
                    ? "직접 운전"
                    : "학습 정책"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {metrics.map((m, i) => (
                  <td key={i}>{value(m)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!mismatch && (
        <svg
          className="map-canvas"
          viewBox="-8.5 -4.65 17 11"
          aria-label="동일 조건 경로 겹쳐보기"
        >
          {[...scenario.obstacles, scenario.goalSpace].map((r, i) => (
            <rect
              key={i}
              x={-r.lengthM / 2}
              y={-r.widthM / 2}
              width={r.lengthM}
              height={r.widthM}
              transform={`translate(${r.centerXM} ${-r.centerYM}) rotate(${(-r.yawRad * 180) / Math.PI})`}
              fill={i === scenario.obstacles.length ? "#244e36" : "#667472"}
              stroke="#b5cec0"
              strokeWidth=".025"
            />
          ))}
          {records.map((e, i) => (
            <polyline
              key={e.header.episodeId}
              points={[
                e.initial.poseTruth,
                ...e.steps.map((s) => s.nextStateTruth),
              ]
                .map((p) => `${p.xM},${-p.yM}`)
                .join(" ")}
              fill="none"
              stroke={i === 0 ? "#b7efcd" : "#ffb775"}
              strokeDasharray={i === 0 ? undefined : ".16 .12"}
              strokeWidth=".08"
            />
          ))}
        </svg>
      )}
      {records.map((e, i) => (
        <div key={e.header.episodeId}>
          <p>
            <b>{i === 0 ? "A · 초록 실선" : "B · 주황 점선"}</b> ·{" "}
            {e.header.episodeId}
            <br />
            모델: {e.header.policyVersion ?? "없음 · 사람 운전"}
            <br />
            시점:{" "}
            {[
              ...new Set([
                e.header.viewMode,
                ...e.steps.map((s) => s.rawInput.viewMode),
              ]),
            ].join(", ")}
            <br />
            도움:{" "}
            {[
              ...new Set([
                ...e.header.assistanceFlags,
                ...e.steps.flatMap((s) => s.rawInput.assistanceFlags),
              ]),
            ].join(", ") || "없음"}
          </p>
          <button onClick={() => onRemove(e.header.episodeId)}>
            {i === 0 ? "A" : "B"} 비교에서 빼기
          </button>
        </div>
      ))}
      <p>
        각 기록의 「기록 재생」에서 저장 상태를 따로 볼 수 있어요. 정지 상태
        경로는 점으로 겹치거나 보이지 않을 수 있어요. 로컬 기록은 진위 증명이
        아니에요.
      </p>
    </section>
  );
}
