import { useEffect, useState } from "react";
import { vehicleFootprint } from "../../engine/src/index";
import {
  deleteEpisode,
  EPISODE_BYTES,
  listEpisodes,
  parseEpisode,
  recordedFrame,
  type LocalEpisode,
} from "./episodes";
import { downloadJson } from "./maps";
import EpisodeCompare from "./EpisodeCompare";

export default function EpisodeLibrary({
  latest,
  error,
  onForget,
}: {
  latest: LocalEpisode | null;
  error: string;
  onForget: () => void;
}) {
  const [records, setRecords] = useState<LocalEpisode[]>([]);
  const [selected, setSelected] = useState<LocalEpisode | null>(null);
  const [comparison, setComparison] = useState<LocalEpisode[]>([]);
  function addComparison(e: LocalEpisode) {
    if (comparison.some((r) => r.header.episodeId === e.header.episodeId))
      return;
    if (comparison.length >= 2) {
      setMessage("비교는 두 기록씩 가능해요. 먼저 A 또는 B를 빼주세요.");
      return;
    }
    setComparison((rows) => [...rows, e]);
    setMessage("");
  }
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [message, setMessage] = useState("");
  async function refresh() {
    try {
      const rows = await listEpisodes();
      setRecords(
        latest &&
          !rows.some((r) => r.header.episodeId === latest.header.episodeId)
          ? [latest, ...rows].slice(0, 5)
          : rows,
      );
      setMessage("");
    } catch {
      setRecords(latest ? [latest] : []);
      setMessage(
        "기록 저장소를 읽지 못했어요. 저장 공간·브라우저 권한을 확인하거나 로컬 기록을 삭제해주세요.",
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, [latest]);
  useEffect(() => {
    if (!playing || !selected) return;
    const timer = window.setInterval(
      () => setIndex((i) => Math.min(i + 1, selected.steps.length)),
      50,
    );
    const pause = () => setPlaying(false);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [playing, selected]);
  useEffect(() => {
    if (selected && index >= selected.steps.length) setPlaying(false);
  }, [index, selected]);
  function open(e: LocalEpisode) {
    setSelected(e);
    setIndex(0);
    setPlaying(false);
  }
  const frame = selected ? recordedFrame(selected, index) : null;
  const car =
    selected && frame
      ? vehicleFootprint(
          frame.poseTruth,
          selected.header.scenarioSnapshot.vehicle,
        )
      : null;
  return (
    <details
      className="workbench"
      id="records"
      onToggle={(e) => {
        if (!e.currentTarget.open) setPlaying(false);
      }}
    >
      <summary>
        내 주행 기록 <span>LOCAL / STATE PLAYBACK</span>
      </summary>
      <p>
        최근 5회가 이 브라우저에만 자동 보관돼요. 서버 전송·학습 기여는 하지
        않아요. 탭 종료 시 마지막 1초 체크포인트까지 불완전 기록으로 남을 수
        있어요. 중요한 기록은 파일로 보관하세요.
      </p>
      <p role="status">{error || message}</p>
      <div className="workbench-actions">
        <button onClick={() => void refresh()}>기록 새로고침</button>
        <button
          onClick={async () => {
            if (
              !window.confirm(
                "이 브라우저의 주행 기록을 모두 삭제할까요? 내려받은 파일은 남아요.",
              )
            )
              return;
            try {
              await deleteEpisode();
              onForget();
              setRecords([]);
              setSelected(null);
              setComparison([]);
              setPlaying(false);
              setMessage("로컬 기록을 삭제했어요.");
            } catch {
              setMessage("삭제하지 못했어요. 다시 시도해주세요.");
            }
          }}
        >
          로컬 기록 전체 삭제
        </button>
        <label className="file-button">
          기록 파일 열기
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > EPISODE_BYTES)
                  throw Error("기록 파일은 16 MB 이하여야 해요.");
                open(parseEpisode(await file.text()));
                setMessage(
                  "외부 파일을 로컬에서 열었어요. 자동 보관·업로드하지 않아요.",
                );
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "기록을 열지 못했어요.",
                );
              }
            }}
          />
        </label>
      </div>
      {!records.length && <p>아직 보관된 기록이 없어요. 한 번 운전해보세요.</p>}
      <ol className="episode-list">
        {records.map((e) => (
          <li key={e.header.episodeId}>
            <span>
              {e.header.controllerKind === "learned" ? "AI" : "직접 운전"} ·{" "}
              {new Date(e.header.startedAt).toLocaleString()} ·{" "}
              {e.footer.terminationReason} · {e.footer.totalSimTimeS.toFixed(1)}
              초
            </span>
            <div className="workbench-actions">
              <button onClick={() => open(e)}>기록 재생</button>
              <button onClick={() => addComparison(e)}>비교에 추가</button>
              <button
                onClick={() =>
                  downloadJson(
                    e,
                    `parkside-episode-${e.header.episodeId}.json`,
                    true,
                  )
                }
              >
                기록 내보내기
              </button>
              <button
                aria-label={`${e.header.episodeId} 기록 삭제`}
                onClick={async () => {
                  try {
                    await deleteEpisode(e.header.episodeId);
                    if (latest?.header.episodeId === e.header.episodeId)
                      onForget();
                    setComparison((rows) =>
                      rows.filter(
                        (r) => r.header.episodeId !== e.header.episodeId,
                      ),
                    );
                    setRecords((rows) =>
                      rows.filter(
                        (r) => r.header.episodeId !== e.header.episodeId,
                      ),
                    );
                    if (selected?.header.episodeId === e.header.episodeId) {
                      setSelected(null);
                      setPlaying(false);
                    }
                  } catch {
                    setMessage("삭제하지 못했어요.");
                  }
                }}
              >
                삭제
              </button>
            </div>
          </li>
        ))}
      </ol>
      <EpisodeCompare
        records={comparison}
        onRemove={(id) =>
          setComparison((rows) => rows.filter((e) => e.header.episodeId !== id))
        }
      />
      {selected && frame && car && (
        <section className="record-player" aria-label="저장 상태 재생">
          <h3>기록 재생 · AI 실시간 운전 아님</h3>
          <p>
            {selected.header.controllerKind} ·{" "}
            {selected.header.policyVersion ?? "정책 버전 없음"} ·{" "}
            {selected.footer.terminationReason} ·{" "}
            {selected.footer.logComplete ? "정상 종료 기록" : "불완전 기록"}
          </p>
          <svg
            viewBox="-8.5 -4.65 17 11"
            className="map-canvas"
            aria-label="기록된 주행 경로"
          >
            <rect
              x="-8.2"
              y="-4.35"
              width="16.4"
              height="10.4"
              fill="#151c1b"
              stroke="#788782"
              strokeWidth=".03"
            />
            {[
              ...selected.header.scenarioSnapshot.obstacles,
              selected.header.scenarioSnapshot.goalSpace,
            ].map((r, i) => (
              <rect
                key={i}
                x={-r.lengthM / 2}
                y={-r.widthM / 2}
                width={r.lengthM}
                height={r.widthM}
                transform={`translate(${r.centerXM} ${-r.centerYM}) rotate(${(-r.yawRad * 180) / Math.PI})`}
                fill={
                  i === selected.header.scenarioSnapshot.obstacles.length
                    ? "#244e36"
                    : "#667472"
                }
                stroke="#b5cec0"
                strokeWidth=".025"
              />
            ))}
            <polyline
              points={[
                selected.initial.poseTruth,
                ...selected.steps.map((s) => s.nextStateTruth),
              ]
                .map((p) => `${p.xM},${-p.yM}`)
                .join(" ")}
              fill="none"
              stroke="#b7efcd"
              strokeWidth=".06"
            />
            <rect
              x={-car.lengthM / 2}
              y={-car.widthM / 2}
              width={car.lengthM}
              height={car.widthM}
              transform={`translate(${car.centerXM} ${-car.centerYM}) rotate(${(-car.yawRad * 180) / Math.PI})`}
              fill="#eee9d8"
              stroke="#fff"
              strokeWidth=".03"
            />
          </svg>
          <label>
            재생 위치
            <input
              type="range"
              min={0}
              max={selected.steps.length}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
            />
          </label>
          <p data-testid="playback-frame">
            {frame.simTimeS.toFixed(2)}초 · step {index}/{selected.steps.length}{" "}
            · {(frame.observation.speedMps * 3.6).toFixed(1)} km/h · 유효 센서{" "}
            {frame.observation.sensors.filter((r) => r.valid).length}/36
          </p>
          <p>
            시점{" "}
            {selected.steps[index - 1]?.rawInput.viewMode ??
              selected.header.viewMode}{" "}
            · 도움{" "}
            {(
              selected.steps[index - 1]?.rawInput.assistanceFlags ??
              selected.header.assistanceFlags
            ).join(", ")}
          </p>
          <div className="workbench-actions">
            <button onClick={() => addComparison(selected)}>
              열린 기록 비교에 추가
            </button>
            <button
              disabled={!selected.steps.length}
              onClick={() => {
                if (index === selected.steps.length) setIndex(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "재생 일시정지" : "저장 상태 재생"}
            </button>
            <button
              onClick={() =>
                downloadJson(
                  selected,
                  `parkside-episode-${selected.header.episodeId}.json`,
                  true,
                )
              }
            >
              열린 기록 내보내기
            </button>
          </div>
        </section>
      )}
    </details>
  );
}
