import { useEffect, useRef, useState } from "react";
import { Radar, Volume2, VolumeX } from "lucide-react";
import type { Scenario, StepResult } from "../../engine/src/index";

const directions = ["전방", "좌측", "후방", "우측"] as const;
// 각 ray가 차체를 빠져나온 뒤의 잔여 길이. 최근접 유클리드 거리/초음파 센서가 아닙니다.
export function sensorFeedback(result: StepResult | null, scenario: Scenario) {
  const sectors = directions.map((label) => ({
    label,
    gap: null as number | null,
    valid: 0,
  }));
  let detected = 0;
  let rawMinimum: number | null = null;
  for (const ray of result?.observation.sensors ?? []) {
    const angle = ray.angleRad + scenario.sensor.poseVehicle.yawRad;
    const index = ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
    if (
      !ray.valid ||
      !Number.isFinite(ray.rangeM) ||
      !Number.isFinite(angle) ||
      !Number.isFinite(ray.updatedSimTimeS) ||
      ray.rangeM < 0 ||
      ray.updatedSimTimeS > result!.simTimeS + 1e-6 ||
      result!.simTimeS - ray.updatedSimTimeS >
        scenario.sensor.periodS * 2 + 1e-6
    )
      continue;
    const sector = sectors[index];
    sector.valid++;
    if (ray.rangeM >= scenario.sensor.maxRangeM) continue;
    detected++;
    rawMinimum =
      rawMinimum === null ? ray.rangeM : Math.min(rawMinimum, ray.rangeM);
    const { xM: x, yM: y } = scenario.sensor.poseVehicle;
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    const v = scenario.vehicle;
    const exitX =
      Math.abs(dx) < 1e-9
        ? Infinity
        : ((dx > 0 ? v.wheelbaseM + v.frontOverhangM : -v.rearOverhangM) - x) /
          dx;
    const exitY =
      Math.abs(dy) < 1e-9
        ? Infinity
        : ((dy > 0 ? v.widthM / 2 : -v.widthM / 2) - y) / dy;
    const gap = Math.max(0, ray.rangeM - Math.max(0, Math.min(exitX, exitY)));
    sector.gap = sector.gap === null ? gap : Math.min(sector.gap, gap);
  }
  const gaps = sectors.flatMap((s) => (s.gap === null ? [] : [s.gap]));
  return {
    sectors,
    detected,
    rawMinimum,
    nearest: gaps.length ? Math.min(...gaps) : null,
  };
}

export function warningPeriod(gap: number | null) {
  if (gap === null || !Number.isFinite(gap) || gap > 1.5) return null;
  return gap <= 0.35 ? 180 : gap <= 0.8 ? 350 : 750;
}

export default function SensorAssist({
  result,
  scenario,
  running,
  details,
}: {
  result: StepResult | null;
  scenario: Scenario;
  running: boolean;
  details: boolean;
}) {
  const feedback = sensorFeedback(result, scenario);
  const latest = useRef(feedback.nearest);
  latest.current = feedback.nearest;
  const context = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [audioError, setAudioError] = useState(false);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (!sound || !running) return;
    let timer: ReturnType<typeof setTimeout>;
    let voice: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    const tick = () => {
      const period = warningPeriod(latest.current);
      const ctx = context.current;
      if (period !== null && ctx?.state === "running") {
        voice?.disconnect();
        gain?.disconnect();
        voice = ctx.createOscillator();
        gain = ctx.createGain();
        voice.type = "sine";
        voice.frequency.value = period === 180 ? 1050 : 780;
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.055, now + 0.008);
        gain.gain.setValueAtTime(0.055, now + 0.075);
        gain.gain.linearRampToValueAtTime(0, now + 0.105);
        voice.connect(gain);
        gain.connect(ctx.destination);
        voice.start(now);
        voice.stop(now + 0.11);
      }
      timer = setTimeout(tick, period ?? 120);
    };
    tick();
    return () => {
      clearTimeout(timer);
      voice?.disconnect();
      gain?.disconnect();
    };
  }, [sound, running]);
  async function toggleSound() {
    if (sound) {
      setSound(false);
      return;
    }
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      setAudioError(false);
      setSound(true);
    } catch {
      setAudioError(true);
      setSound(false);
    }
  }
  return (
    <aside
      className={"sensor-assist " + (details ? "expanded" : "")}
      aria-label="실시간 가상 센서"
    >
      <div className="sensor-heading">
        <span>
          <Radar size={16} /> SENSOR {running ? "LIVE" : "HOLD"} <i />
        </span>
        <button
          className="icon-button"
          aria-label="센서 경고음"
          aria-pressed={sound}
          onClick={toggleSound}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </div>
      <div className="proximity-map">
        <div className="sensor-car" aria-hidden="true">
          <i />
          <b />
        </div>
        {feedback.sectors.map((s, i) => (
          <div
            key={s.label}
            className={"proximity-sector sector-" + i}
            data-level={
              s.gap === null
                ? "clear"
                : s.gap <= 0.35
                  ? "danger"
                  : s.gap <= 0.8
                    ? "near"
                    : "clear"
            }
          >
            <span>{s.label}</span>
            <strong data-testid={"sensor-" + i}>
              {!s.valid
                ? "수신 없음"
                : s.gap === null
                  ? "미검출"
                  : s.gap.toFixed(2) + " m"}
            </strong>
            <i />
          </div>
        ))}
      </div>
      <p className="sensor-disclaimer">광선 방향 차체 여유 · 안전 보장 아님</p>
      {details && (
        <div className="sensor-details">
          <span>
            중심 원시 최소{" "}
            <b data-testid="raw-range">
              {feedback.rawMinimum === null
                ? "미검출"
                : feedback.rawMinimum.toFixed(2) + " m"}
            </b>
          </span>
          <span>
            감지 광선{" "}
            <b>
              {feedback.detected} / {scenario.sensor.rayCount}
            </b>
          </span>
          <span>
            관측 시각 <b>{(result?.simTimeS ?? 0).toFixed(2)} s</b>
          </span>
          <small>가상 ray-box · 무잡음 · 경계/장식 미감지</small>
        </div>
      )}
      {audioError && (
        <p className="audio-error">
          소리를 사용할 수 없어요. 시각 경고를 확인해주세요.
        </p>
      )}
    </aside>
  );
}
