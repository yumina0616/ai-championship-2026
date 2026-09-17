import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flag,
  Grid2X2,
  MoveUpRight,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Route,
  X,
} from "lucide-react";
import {
  loadPreview,
  templates,
  type Mode,
  type PreviewState,
  type TemplateId,
} from "./preview";
import { useDriving } from "./driving";
import type { DriverInput, Gear } from "./driver-controls";
import type { CameraMode } from "./ParkingScene";
import SensorAssist, { sensorFeedback } from "./SensorAssist";
import ParkingFeedback, { parkingMessage } from "./ParkingFeedback";
import { chapterAt, storyChapters } from "./story";
import MapEditor from "./MapEditor";
import SharedMap from "./SharedMap";
import LocalContributionTest from "./LocalContributionTest";
import EpisodeLibrary from "./EpisodeLibrary";
import { mapScenario, type ParkingMap } from "./maps";
import { POLICY_LABEL, type LoadedPolicy } from "./policy-info";
const ParkingScene = lazy(() => import("./ParkingScene"));

import { CollectionSettings, useCollection } from "./collection";

function Logo() {
  return (
    <span className="wordmark">
      <span className="logo-mark">
        <Route size={22} />
      </span>
      <span>
        Mr<span className="wordmark-period">.</span>Park
      </span>
    </span>
  );
}
function Wheel({ angle = 0 }: { angle?: number }) {
  return (
    <svg
      className="wheel"
      viewBox="0 0 100 100"
      style={{ transform: `rotate(${((-angle * 180) / Math.PI) * 10}deg)` }}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="42" />
      <path d="M10 44h24l9 11v35M90 44H66L57 55v35" />
      <circle cx="50" cy="49" r="13" />
      <path className="wheel-marker" d="M45 8h10" />
    </svg>
  );
}
function MiniMap({ variant }: { variant: TemplateId }) {
  return (
    <div className={"mission-map " + variant} aria-hidden="true">
      <div className="map-road" />
      {[-2, -1, 0, 1, 2].map((i) => (
        <span
          className={"map-bay " + (i === 0 ? "goal" : "")}
          style={{ "--bay": i } as CSSProperties}
          key={i}
        >
          {(Math.abs(i) === 2 || (variant !== "open" && i !== 0)) && <i />}
        </span>
      ))}
      <b className="map-player" />
      {variant === "pillar" && <b className="map-pillar" />}
      <span className="map-arrow">↗</span>
    </div>
  );
}
function Buddy() {
  return (
    <div className="buddy" aria-hidden="true">
      <div className="buddy-aerial" />
      <div className="buddy-head">
        <i />
        <i />
      </div>
      <div className="buddy-body" />
      <b />
      <b />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<"landing" | "drive">("landing");
  const [template, setTemplate] = useState<TemplateId>("open");
  const [customMap, setCustomMap] = useState<ParkingMap | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [recordLocally, setRecordLocally] = useState(() => {
    try {
      return localStorage.getItem("parkside-record-locally") !== "off";
    } catch {
      return true;
    }
  });
  const [preferenceError, setPreferenceError] = useState("");
  const [quality, setQuality] = useState<"high" | "low">(() => {
    try {
      return localStorage.getItem("parkside-quality") === "low"
        ? "low"
        : "high";
    } catch {
      return "high";
    }
  });
  const [mode, setMode] = useState<Mode>("human");
  const [camera, setCamera] = useState<CameraMode>("orbit");
  const [sensors, setSensors] = useState(false);
  const [sensorSound, setSensorSound] = useState(false);
  const [grid, setGrid] = useState(false);
  const [state, setState] = useState<PreviewState>("idle");
  const [error, setError] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const [dialog, setDialog] = useState<"guide" | "about" | null>(null);
  const [reduceMotion, setReduceMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [motionPaused, setMotionPaused] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [opening, setOpening] = useState(!reduceMotion);
  const [openingFade, setOpeningFade] = useState(false);
  const finishOpening = useCallback(() => {
    setOpening(false);
    setOpeningFade(true);
  }, []);
  useEffect(() => {
    if (!openingFade) return;
    const timer = window.setTimeout(() => setOpeningFade(false), 800);
    return () => window.clearTimeout(timer);
  }, [openingFade]);
  useEffect(() => {
    if (reduceMotion || motionPaused || template !== "open") setOpening(false);
  }, [reduceMotion, motionPaused, template]);
  const [departing, setDeparting] = useState(false);
  const [storyProgress, setStoryProgress] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setIntroDismissed(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);
  const [sceneBox, setSceneBox] = useState({
    top: 0,
    height: window.innerHeight,
  });
  const customScenario = useMemo(
    () => (customMap ? mapScenario(customMap) : undefined),
    [customMap],
  );
  const collection = useCollection();
  const driving = useDriving(template, customScenario, recordLocally, collection.enabled ? collection.upload : undefined);
  driving.context.current = {
    viewMode: camera,
    assistanceFlags:
      mode === "mascot"
        ? ["spectator"]
        : [
            "parking-status",
            "sensor-clearance",
            "steering-return",
            ...(sensors ? ["sensor-rays"] : []),
            ...(grid ? ["grid"] : []),
            ...(camera === "rear" ? ["reverse-guide"] : []),
            ...(sensorSound ? ["sensor-sound"] : []),
          ],
  };
  const wheelDrag = useRef<{ id: number; x: number; value: number } | null>(
    null,
  );
  useEffect(() => {
    const releaseWheel = () => {
      if (!wheelDrag.current) return;
      wheelDrag.current = null;
      driving.steer(null);
    };
    window.addEventListener("pointerup", releaseWheel);
    window.addEventListener("pointercancel", releaseWheel);
    return () => {
      window.removeEventListener("pointerup", releaseWheel);
      window.removeEventListener("pointercancel", releaseWheel);
    };
  }, [driving.steer]);
  const abort = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const modal = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const driveTitle = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const garageStart = useRef<HTMLButtonElement>(null);
  const sceneFailed = useCallback(() => {
    setDeparting(false);
    setView("drive");
    requestId.current += 1;
    abort.current?.abort();
    driving.stop();
    setError(
      "3D 화면을 열지 못해 주행을 중단했어요. WebGL을 지원하는 브라우저에서 다시 시도해주세요.",
    );
    setState("error");
  }, [driving.stop]);
  const selected = templates.find((t) => t.id === template)!;
  const observation = driving.result?.observation;
  const speed = Math.abs((observation?.speedMps ?? 0) * 3.6);
  const ended = driving.result?.outcome.reason;
  const parkConfirm =
    mode === "human" &&
    state === "ready" &&
    ended === "success" &&
    driving.gear !== "P";
  const positionError = observation
    ? Math.hypot(observation.goalRelative.xM, observation.goalRelative.yM)
    : 0;
  const angleError = observation
    ? (Math.abs(observation.goalRelative.yawRad) * 180) / Math.PI
    : 0;
  const ranges =
    observation?.sensors
      .filter((r) => r.valid && Number.isFinite(r.rangeM))
      .map((r) => r.rangeM) ?? [];
  const nearest = ranges.length ? Math.min(...ranges) : null;
  const controlsDisabled =
    mode === "mascot" || state !== "ready" || driving.paused || !!ended;
  const staticStory = reduceMotion || motionPaused;
  const chapter = staticStory ? 0 : chapterAt(storyProgress);
  const storySensor = sensorFeedback(driving.result, driving.scenario);

  // 같은 Canvas를 유지하고 표시 영역만 옮겨 카메라/조명 문맥이 끊기지 않게 합니다.
  useLayoutEffect(() => {
    const area = document.querySelector(
      view === "landing" ? ".hero" : ".driving-stage",
    );
    if (!area) return;
    let frame = 0;
    const measure = () => {
      const rect = area.getBoundingClientRect();
      setSceneBox({
        top: view === "landing" ? rect.top : 0,
        height:
          view === "landing" ? rect.height : Math.max(window.innerHeight, 780),
      });
    };
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    const track = document.querySelector(".story-scroll");
    if (track) observer.observe(track);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", scroll);
    };
  }, [view, staticStory]);

  useEffect(() => {
    if (!parkConfirm) return;
    const confirm = (event: KeyboardEvent) => {
      if (
        event.code === "KeyP" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("dialog,input,textarea,select")
        )
      ) {
        event.preventDefault();
        driving.shift("P");
      }
    };
    window.addEventListener("keydown", confirm);
    return () => window.removeEventListener("keydown", confirm);
  }, [parkConfirm, driving.shift]);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduceMotion(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (state === "ready" && driving.failure) {
      setError(driving.failure);
      setState("error");
    } else if (
      state === "ready" &&
      driving.result?.outcome.terminated &&
      !parkConfirm
    )
      setState("finished");
  }, [state, driving.failure, driving.result, parkConfirm]);
  useEffect(() => {
    if (state === "ready") driveTitle.current?.focus({ preventScroll: true });
    if (state === "finished")
      resultTitle.current?.focus({ preventScroll: true });
  }, [state]);
  useEffect(() => {
    if (dialog) {
      previousFocus.current = document.activeElement as HTMLElement;
      modal.current?.showModal();
      if (driving.active) driving.pause();
    } else if (modal.current?.open) {
      modal.current.close();
      previousFocus.current?.focus();
    }
  }, [dialog, driving.active, driving.pause]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !modal.current?.open &&
        view === "drive" &&
        state === "ready"
      )
        driving.pause();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [view, state, driving.pause]);

  async function start() {
    if (state === "loading") return;
    if (state === "error") setSceneRevision((n) => n + 1);
    setIntroDismissed(true);
    setOpening(false);
    setOpeningFade(false);
    const cinematicEntry = view === "landing" && !reduceMotion && !motionPaused;
    const began = performance.now();
    const id = ++requestId.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setDeparting(cinematicEntry);
    if (!cinematicEntry) setView("drive");
    setState("loading");
    setError("");
    setCamera("follow");
    driving.reset();
    window.scrollTo({ top: 0, behavior: "instant" });
    // 공개 환경의 첫 AI 실행은 TF.js chunk 다운로드·초기화까지 포함한다.
    const timeout = window.setTimeout(
      () => controller.abort("timeout"),
      mode === "mascot" ? 30000 : 8000,
    );
    let loaded: LoadedPolicy | null = null;
    try {
      if (cinematicEntry) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
        if (id !== requestId.current) return;
        if (controller.signal.aborted) throw Error("진입이 취소됐어요.");
        setView("drive");
        setDeparting(false);
      }
      await loadPreview(controller.signal);
      if (mode === "mascot") {
        const { loadPolicy } = await import("./policy");
        loaded = await loadPolicy(driving.scenario, controller.signal);
      }
      if (cinematicEntry && !controller.signal.aborted) {
        await new Promise<void>((resolve) => {
          const done = () => {
            window.clearTimeout(timer);
            controller.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = window.setTimeout(
            done,
            Math.max(0, 1700 - (performance.now() - began)),
          );
          controller.signal.addEventListener("abort", done, { once: true });
        });
      }
      if (id === requestId.current) {
        if (controller.signal.aborted) throw Error("진입이 취소됐어요.");
        const started = driving.start(loaded);
        loaded = null; // 성공/실패 모두 driving.start가 소유권을 받는다.
        if (!started) throw Error("주차장 초기화에 실패했어요.");
        setState("ready");
      }
    } catch (cause) {
      if (id === requestId.current) {
        setError(
          controller.signal.reason === "timeout"
            ? "응답이 늦어지고 있어요. 다시 시도해주세요."
            : mode === "mascot" && cause instanceof Error
              ? cause.message
              : "실행 리소스를 불러오지 못했어요. 인터넷 연결을 확인해주세요.",
        );
        setState("error");
      }
    } finally {
      loaded?.dispose();
      window.clearTimeout(timeout);
    }
  }
  function leave() {
    setDeparting(false);
    requestId.current++;
    abort.current?.abort();
    driving.reset();
    setState("idle");
    setView("landing");
    setCamera("orbit");
    requestAnimationFrame(() => {
      document.getElementById("garage")?.scrollIntoView({ block: "start" });
      garageStart.current?.focus({ preventScroll: true });
    });
  }
  function resume() {
    driving.resume();
    driveTitle.current?.focus({ preventScroll: true });
  }
  function shift(gear: Gear) {
    driving.shift(gear);
    driveTitle.current?.focus({ preventScroll: true });
  }
  function pedal(
    input: DriverInput,
    label: string,
    key: string,
    icon?: React.ReactNode,
  ) {
    return (
      <button
        className={
          "input-button " +
          input +
          (driving.held.includes(input) ? " pressed" : "")
        }
        aria-label={label}
        aria-pressed={driving.held.includes(input)}
        disabled={controlsDisabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          driving.press(input);
        }}
        onPointerUp={() => driving.release(input)}
        onPointerCancel={() => driving.release(input)}
        onLostPointerCapture={() => driving.release(input)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            driving.press(input);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") driving.release(input);
        }}
        onBlur={() => driving.release(input)}
      >
        {icon ?? (
          <span className="pedal-treads">
            <i />
            <i />
            <i />
          </span>
        )}
        <span>{label}</span>
        <kbd>{key}</kbd>
      </button>
    );
  }

  return (
    <div
      className={
        "app cinema " +
        view +
        (state === "loading" ? " entering" : "") +
        (departing ? " departing" : "") +
        (staticStory ? " static-story" : "") +
        (motionPaused ? " motion-paused" : "") +
        (opening ? " opening-drive" : "") +
        (openingFade ? " opening-handoff" : "")
      }
    >
      <div
        className="world-stage"
        style={{ top: sceneBox.top, height: sceneBox.height }}
        data-testid="persistent-scene"
      >
        <Suspense
          fallback={
            <div className="scene-fallback">3D 공간을 준비하고 있어요…</div>
          }
        >
          <ParkingScene
            key={sceneRevision}
            template={template}
            customScenario={customScenario}
            quality={quality}
            result={driving.result}
            motion={driving.motion}
            opening={opening}
            onOpeningDone={finishOpening}
            cameraMode={view === "landing" && !departing ? "orbit" : camera}
            sensors={sensors || (view === "landing" && chapter === 2)}
            onStoryProgress={setStoryProgress}
            grid={view === "drive" && grid}
            reducedMotion={reduceMotion || motionPaused}
            brake={driving.held.includes("brake")}
            reverse={driving.gear === "R"}
            driving={view === "drive" || departing}
            onUnavailable={
              view === "drive" || departing ? sceneFailed : finishOpening
            }
          />
        </Suspense>
      </div>
      {!introDismissed && (
        <div className="opening-signature" aria-hidden="true">
          <span>Mr.Park</span>
          <small>A PHYSICAL AI EXPERIMENT</small>
        </div>
      )}
      <a
        className="skip-link"
        href={view === "landing" ? "#garage" : "#cockpit"}
      >
        조작 영역으로 바로가기
      </a>
      {opening && (
        <aside className="opening-caption" aria-label="기준 제어기 주차 시연">
          <span className="opening-eyebrow">
            <i /> BASELINE / AUTOPARK
          </span>
          <strong>One smooth move.</strong>
          <p>기준 제어기 주차 기록 · 2배속 재생 · 학습 AI 아님</p>
          <button onClick={finishOpening}>
            오프닝 건너뛰기 <ArrowUpRight size={14} />
          </button>
        </aside>
      )}
      {view === "landing" ? (
        <>
          <header className="site-header">
            <a href="#" aria-label="Mr.Park 미스터팍 홈">
              <Logo />
            </a>
            <nav aria-label="메인 메뉴">
              <a href="#garage">플레이그라운드</a>
              <a href="#experiment">우리의 실험</a>
              <button onClick={() => setDialog("guide")}>
                조작 가이드 <ArrowUpRight size={14} />
              </button>
            </nav>
            <span className="build-tag">
              <i /> PHYSICAL AI PLAYGROUND
            </span>
          </header>
          <main>
            <div className="story-scroll">
              <section
                className="hero"
                aria-label="주차 공간과 센서 이야기"
                data-chapter={chapter}
                data-film-progress={storyProgress.toFixed(4)}
              >
                <div className="story-watermark" aria-hidden="true">
                  {storyChapters[chapter].label}
                </div>
                <div className="story-frame" aria-hidden="true">
                  <span>LOCAL SIMULATION / 01</span>
                  <span>COMPACT · 4.4 M</span>
                </div>
                <div className="hero-topline">
                  <span>THE PARKING PLAYGROUND</span>
                  <span>
                    작은 공간, 무한한 시도. <MoveUpRight size={14} />
                  </span>
                </div>
                <div
                  className="hero-copy"
                  inert={chapter !== 0 || opening}
                  aria-hidden={chapter !== 0 || opening}
                >
                  <div className="edition-label">
                    <span className="outline-label">
                      A PHYSICAL AI DRIVING EXPERIENCE
                    </span>
                  </div>
                  <h1 id="hero-title" aria-label="주차를 플레이하다.">
                    <span>{storyChapters[0].title}</span>
                    <span className="outline-type">
                      {storyChapters[0].subtitle}
                    </span>
                  </h1>
                  <div className="hero-description">
                    <h2>작은 움직임이, 새로운 가능성으로.</h2>
                    <p>
                      직접 운전하고. 공간을 감각하고.
                      <br />
                      같은 주차장에서 다른 시도를 발견하세요.
                    </p>
                  </div>
                </div>
                <div
                  className="story-copy space-copy"
                  inert={chapter !== 1}
                  aria-hidden={chapter !== 1}
                >
                  <span className="story-kicker">02 / THE SPACE BETWEEN</span>
                  <h2>
                    {storyChapters[1].title}
                    <br />
                    <em>{storyChapters[1].subtitle}</em>
                  </h2>
                  <p>
                    {storyChapters[1].description}
                    <br />옆 차량, 기둥, 한 칸의 여유.
                    <br />
                    당신이 선택한 환경에서 다시 시작하세요.
                  </p>
                  <div className="story-facts">
                    <span>
                      <b>
                        {(
                          driving.scenario.vehicle.wheelbaseM +
                          driving.scenario.vehicle.frontOverhangM +
                          driving.scenario.vehicle.rearOverhangM
                        ).toFixed(1)}
                      </b>{" "}
                      m · 차량 길이
                    </span>
                    <span>
                      <b>{driving.scenario.vehicle.widthM.toFixed(1)}</b> m ·
                      차량 폭
                    </span>
                  </div>
                </div>
                <div
                  className="story-copy sense-copy"
                  inert={chapter !== 2}
                  aria-hidden={chapter !== 2}
                >
                  <span className="story-kicker">
                    03 / A DIFFERENT WAY TO SEE
                  </span>
                  <h2>
                    {storyChapters[2].title}
                    <br />
                    <em>{storyChapters[2].subtitle}</em>
                  </h2>
                  <p>
                    {storyChapters[2].description}
                    <br />
                    장애물까지의 거리를 기하로 계산합니다.
                    <br />
                    운전을 시작하면 움직임에 맞춰 다시 계산됩니다.
                  </p>
                  <div className="story-facts">
                    <span>
                      <b>{driving.scenario.sensor.rayCount}</b> 가상 광선
                    </span>
                    <span>
                      <b>{driving.scenario.sensor.maxRangeM}</b> m · 최대 범위
                    </span>
                  </div>
                </div>
                {chapter === 2 && (
                  <aside
                    className="story-sensor-proof"
                    aria-label="초기 센서 측정값"
                  >
                    <span>
                      <Radar size={14} /> SENSOR SNAPSHOT
                    </span>
                    <strong>
                      {storySensor.rawMinimum === null
                        ? "미검출"
                        : storySensor.rawMinimum.toFixed(2) + " m"}
                    </strong>
                    <p>현재 배치의 중심 센서 원시 최소 거리</p>
                    <small>무잡음 가상 센서 · 실차 안전 기준 아님</small>
                  </aside>
                )}
                <div className="hero-visual">
                  <div className="orbit-lettering" aria-hidden="true">
                    LET’S TAKE A LITTLE TURN ↗
                  </div>
                  <button
                    className="floating-sensor"
                    aria-pressed={sensors}
                    onClick={() => setSensors(!sensors)}
                  >
                    <Radar size={23} />
                    <span>
                      SENSOR VISION
                      <small>센서 시야 {sensors ? "ON" : "OFF"} ↗</small>
                    </span>
                  </button>
                  <span className="scene-hint">
                    <span /> DRAG TO EXPLORE
                  </span>
                  <div className="parking-stamp" aria-hidden="true">
                    <span>P</span>
                    <small>
                      NO PRESSURE.
                      <br />
                      JUST PARK.
                    </small>
                  </div>
                </div>
                <div className="hero-actions">
                  <button
                    className="button orange"
                    disabled={state === "loading"}
                    onClick={() => {
                      if (chapter === 2) setSensors(true);
                      void start();
                    }}
                  >
                    바로 운전하기 <ArrowUpRight size={21} />
                  </button>
                  <a className="text-link" href="#garage">
                    다른 공간 고르기 <ArrowDown size={16} />
                  </a>
                </div>
                <p className="hero-footnote">
                  하나의 주차장. 보는 순간에서, 운전하는 순간으로.
                </p>
                <div className="story-chapters" aria-label="자동 재생 장면">
                  {storyChapters.map((item, index) => (
                    <span
                      className="film-chapter"
                      key={item.label}
                      aria-current={chapter === index ? "step" : undefined}
                    >
                      <span>0{index + 1}</span>
                      {item.label}
                      <i
                        style={{
                          transform: `scaleX(${Math.max(0, Math.min(1, storyProgress * 3 - index))})`,
                        }}
                      />
                    </span>
                  ))}
                  <a href="#garage">
                    공간 둘러보기 <ArrowDown size={14} />
                  </a>
                </div>
                <div className="hero-bottom">
                  <span>
                    <span className="dot orange-dot" /> 현재 실행 가능한 주차
                    실험
                  </span>
                  <span>직접 운전 / 가상 거리 센서 / 로컬 결과</span>
                  <button
                    className="motion-toggle"
                    aria-pressed={motionPaused}
                    onClick={() => setMotionPaused(!motionPaused)}
                  >
                    장식 모션 {motionPaused ? "켜기" : "멈추기"}
                  </button>
                  <a href="#garage" aria-label="차고로 이동">
                    <ArrowDown size={19} />
                  </a>
                </div>
              </section>
            </div>
            {staticStory && (
              <section className="story-static" aria-label="공간과 센서 소개">
                {storyChapters.slice(1).map((item) => (
                  <article key={item.label}>
                    <span className="eyebrow">{item.label}</span>
                    <h2>
                      {item.title} {item.subtitle}
                    </h2>
                    <p>{item.description}</p>
                  </article>
                ))}
                <p>개발용 차량 · 무잡음 가상 거리 센서 · 실험용 학습 정책</p>
              </section>
            )}
            <div className="play-ribbon" aria-hidden="true">
              <span>LESS PRESSURE</span>
              <b>✳</b>
              <span>MORE PLAY</span>
              <b>↗</b>
              <span>ONE MORE TRY</span>
              <b>✳</b>
              <span>FEEL THE SPACE</span>
            </div>
            <section
              id="garage"
              className="garage-section"
              aria-labelledby="garage-title"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">01 — CHOOSE YOUR SPACE</span>
                  <h2 id="garage-title">
                    오늘은 어디에
                    <br className="mobile-break" /> 주차해볼까?
                  </h2>
                </div>
                <p>
                  같은 자리, 다른 시도. 나만의 움직임을 찾아보세요.
                  <br />
                  템플릿으로 시작하거나 나만의 주차장을 편집해보세요.
                </p>
              </div>
              <fieldset className="mission-list">
                <legend className="sr-only">주차 환경 선택</legend>
                {templates.map((t, i) => (
                  <label
                    className={
                      "mission " +
                      (!customMap && template === t.id ? "selected" : "")
                    }
                    key={t.id}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={!customMap && template === t.id}
                      onChange={() => {
                        setCustomMap(null);
                        setTemplate(t.id);
                      }}
                      aria-label={t.title}
                    />
                    <div className="mission-header">
                      <span>EXPERIMENT / 0{i + 1}</span>
                      <span className="mission-check">
                        {!customMap && template === t.id ? (
                          <Check size={15} />
                        ) : (
                          <ArrowUpRight size={16} />
                        )}
                      </span>
                    </div>
                    <MiniMap variant={t.id} />
                    <div className="mission-caption">
                      <div>
                        <h3>{t.title}</h3>
                        <p>{t.description}</p>
                      </div>
                      <span className="level">
                        {i === 0 ? "OPEN" : i === 1 ? "NARROW" : "OBSTACLE"}
                      </span>
                    </div>
                  </label>
                ))}
              </fieldset>
              <SharedMap
                onApply={(map) => {
                  setCustomMap(map);
                  setOpening(false);
                  setEditorRevision((n) => n + 1);
                }}
              />
              <MapEditor
                key={editorRevision}
                template={template}
                initialMap={customMap}
                onApply={(map) => {
                  setOpening(false);
                  setCustomMap(map);
                }}
              />
              {customMap && (
                <p className="availability">
                  적용한 맵: {customMap.name} · 아래 시작 버튼으로 운전해보세요.
                </p>
              )}
              <div className="garage-console">
                <div className="car-spec">
                  <span className="spec-icon">
                    <Route size={26} />
                  </span>
                  <div>
                    <strong>COMPACT / 01</strong>
                    <span>개발용 차량 · 4.4 × 1.8 m · 축간거리 2.6 m</span>
                  </div>
                </div>
                <fieldset className="mode-switch">
                  <legend className="sr-only">운전 방식</legend>
                  <label className={mode === "human" ? "selected" : ""}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "human"}
                      onChange={() => setMode("human")}
                    />
                    직접 운전
                  </label>
                  <label className={mode === "mascot" ? "selected" : ""}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === "mascot"}
                      onChange={() => setMode("mascot")}
                    />
                    미스터팍 <small>AI 실험 모델</small>
                  </label>
                </fieldset>
                <button
                  ref={garageStart}
                  className="button orange"
                  disabled={state === "loading"}
                  onClick={start}
                >
                  {mode === "human" ? "이 공간에서 시작" : "미스터팍 운전 보기"}
                  <ArrowRight size={19} />
                </button>
              </div>
              <p className="availability">
                {recordLocally
                  ? "주행은 이 브라우저에 최근 5회만 보관해요."
                  : "다음 주행은 기록하지 않아요. 기존 기록은 유지돼요."}{" "}
                서버 전송은 아래 학습용 전송 설정을 켠 경우에만 해요.
              </p>
              <label className="local-record-choice">
                그래픽 품질
                <select
                  aria-label="그래픽 품질"
                  value={quality}
                  onChange={(e) => {
                    const next = e.target.value as "high" | "low";
                    setQuality(next);
                    try {
                      localStorage.setItem("parkside-quality", next);
                    } catch {
                      setPreferenceError("그래픽 설정은 이번 탭에만 적용돼요.");
                    }
                  }}
                >
                  <option value="high">고화질</option>
                  <option value="low">성능 우선</option>
                </select>
              </label>
              <p className="availability">
                성능 우선은 그림자와 렌더 해상도만 낮춰요. 차량 물리·충돌·센서
                계산은 동일해요.
              </p>
              <label className="local-record-choice">
                <input
                  type="checkbox"
                  checked={recordLocally}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setRecordLocally(enabled);
                    try {
                      localStorage.setItem(
                        "parkside-record-locally",
                        enabled ? "on" : "off",
                      );
                      setPreferenceError("");
                    } catch {
                      setPreferenceError(
                        "설정은 이번 탭에만 적용돼요. 새로고침하면 다시 확인해주세요.",
                      );
                    }
                  }}
                />{" "}
                이 브라우저에 주행 기록 보관
              </label>
              {preferenceError && <p role="status">{preferenceError}</p>}
              <CollectionSettings collection={collection} />
              <EpisodeLibrary
                onForget={driving.forgetEpisode}
                latest={driving.lastEpisode}
                error={driving.storageError}
              />
              {import.meta.env.DEV && <LocalContributionTest />}
              {mode === "mascot" && (
                <p className="availability" role="status">
                  실험 정책 {POLICY_LABEL} · 동일 차량·무잡음 36-ray 센서로
                  실행해요. 미관측 환경 평가 0/1 성공. 편집한 맵은 미평가
                  환경이며 충돌하거나 실패할 수 있어요. 이상적인 자기 위치를
                  사용하며 실차 자율주행 성능을 뜻하지 않아요.
                </p>
              )}
            </section>
            <section id="experiment" className="experiment-section">
              <div className="experiment-copy">
                <span className="eyebrow">02 — MORE THAN A PARKING GAME</span>
                <h2>
                  당신의 한 번 더가,
                  <br />
                  로봇의 새로운 시선으로.
                </h2>
                <p>
                  내가 직접 운전하고, 미스터팍도 같은 공간에 도전하고.
                  <br />
                  우리는 성공뿐 아니라 실패에서도 배울 수 있는 주차장을
                  만들어요.
                </p>
                <button
                  className="text-link"
                  onClick={() => setDialog("about")}
                >
                  어떤 실험인가요? <ArrowUpRight size={18} />
                </button>
                <div className="experiment-steps">
                  <span>
                    <b>01</b> 직접 시도
                  </span>
                  <ArrowRight size={14} />
                  <span>
                    <b>02</b> 결과 확인
                  </span>
                  <ArrowRight size={14} />
                  <span>
                    <b>03</b> AI와 비교
                  </span>
                </div>
              </div>
              <div className="buddy-board">
                <span className="buddy-label">YOUR NEXT CO-DRIVER</span>
                <Buddy />
                <div>
                  <strong>미래에서 온 주차 초보.</strong>
                  <p>아직 면허 연습 중. 실험 모델의 실패와 도전을 지켜봐요.</p>
                </div>
                <span className="board-corner">
                  LEARNED POLICY / EXPERIMENTAL ↗
                </span>
              </div>
            </section>
            <footer className="site-footer">
              <Logo />
              <p>
                가상 환경의 실험입니다. 실제 차량 제어·운전 교육을 대신하지
                않습니다.
                <br />
                동의하지 않은 주행 데이터는 서버에 저장하거나 전송하지 않습니다.
                {" "}<a href="/data-notice.html" target="_blank" rel="noreferrer">서비스·데이터 안내</a>
              </p>
              <span>
                BUILT TO TRY AGAIN.
                <br />
                AI CHAMPIONSHIP 2026
              </span>
            </footer>
          </main>
        </>
      ) : (
        <main className="drive-screen">
          <header className="drive-header">
            <button className="back-button" onClick={leave}>
              <ArrowLeft size={17} />
              <span>차고</span>
            </button>
            <Logo />
            <span className="run-badge">
              <i />{" "}
              {state === "loading"
                ? "PREPARING"
                : state === "error"
                  ? "UNAVAILABLE"
                  : parkConfirm
                    ? "AWAITING P"
                    : state === "finished"
                      ? "RUN COMPLETE"
                      : driving.paused
                        ? "PAUSED"
                        : "LIVE SIMULATION"}
            </span>
            <button
              className="icon-button"
              aria-label="조작 가이드"
              onClick={() => setDialog("guide")}
            >
              <CircleHelp size={20} />
            </button>
          </header>
          <section
            className="driving-stage"
            aria-label="실시간 주차 시뮬레이션"
          >
            <div className="mission-hud">
              <span className="eyebrow">
                EXPERIMENT / 0
                {templates.findIndex((t) => t.id === template) + 1}
              </span>
              <h1 ref={driveTitle} tabIndex={-1}>
                {customMap?.name ?? selected.title}
              </h1>
              <p>
                <Flag size={13} />{" "}
                {mode === "mascot"
                  ? "미스터팍 · LEARNED LIVE · 센서 관측으로 실제 추론 중"
                  : "표시된 칸에 정차한 뒤 P로 마무리"}
              </p>
              {mode === "mascot" && (
                <p className="policy-badge">
                  {POLICY_LABEL} · 성능 미보장 / 실패도 기록
                </p>
              )}
            </div>
            <div className="view-controls">
              <div className="camera-switch" aria-label="카메라 시점">
                {(
                  [
                    ["follow", "차량 추적"],
                    ["top", "탑뷰"],
                    ["rear", "후방 시점"],
                    ["orbit", "자유 시점"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={camera === id}
                    onClick={() => setCamera(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="센서 표시"
                aria-pressed={sensors}
                onClick={() => setSensors(!sensors)}
              >
                <Radar size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="격자 표시"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={18} />
              </button>
            </div>
            <SensorAssist
              onSoundChange={setSensorSound}
              result={driving.result}
              scenario={driving.scenario}
              running={
                state === "ready" &&
                driving.active &&
                !driving.paused &&
                !dialog
              }
              details={sensors}
            />
            {state === "ready" &&
              !driving.paused &&
              !ended &&
              driving.parkingStatus && (
                <ParkingFeedback
                  status={driving.parkingStatus}
                  criteria={driving.scenario.successCriteria}
                />
              )}
            <div className="stage-caption">
              <span>SIMULATED ENVIRONMENT · NO LIVE VEHICLE</span>
              <span>
                {camera === "orbit"
                  ? "드래그하여 둘러보기"
                  : camera === "follow"
                    ? "차량을 따라가는 카메라"
                    : camera === "rear"
                      ? "조향 연장선 · 충돌 미검사 · 실차 카메라 아님"
                      : "전체 환경 보기 · 시점 도움 사용"}
              </span>
            </div>
            {(state === "loading" || state === "error") && (
              <div
                className={
                  "stage-overlay " +
                  (state === "loading" ? "entry-overlay" : "")
                }
              >
                <section className="notice-panel">
                  <span className="eyebrow">GARAGE CONNECTION</span>
                  <h2>
                    {state === "loading"
                      ? "시동을 준비하고 있어요."
                      : "잠깐, 연결을 확인할까요?"}
                  </h2>
                  <p role={state === "error" ? "alert" : "status"}>
                    {state === "error"
                      ? error
                      : mode === "mascot"
                        ? "AI 모델을 준비하는 중이에요. 첫 실행은 최대 30초 걸릴 수 있어요."
                        : "실행 리소스를 확인하는 중입니다."}
                  </p>
                  {state === "error" && (
                    <button className="button orange" onClick={start}>
                      다시 시도 <RotateCcw size={17} />
                    </button>
                  )}
                  <button className="text-link" onClick={leave}>
                    {state === "loading" ? "불러오기 취소" : "차고로 돌아가기"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            )}
            {state === "ready" && driving.paused && !parkConfirm && (
              <div className="stage-overlay">
                <section className="notice-panel">
                  <span className="pause-symbol">
                    <Pause size={24} />
                  </span>
                  <span className="eyebrow">TAKE A BREATHER</span>
                  <h2>잠시 멈춰도 괜찮아.</h2>
                  <p>다른 창으로 이동하면 자동 일시정지해요.</p>
                  <button className="button orange" onClick={resume}>
                    계속 운전하기 <Play size={17} />
                  </button>
                  <button
                    className="text-link"
                    onClick={() => {
                      driving.stop();
                      setState("finished");
                    }}
                  >
                    이번 연습 마치기 <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            )}
            {parkConfirm && (
              <div className="stage-overlay">
                <section className="notice-panel parking-confirm" role="status">
                  <Check size={28} />
                  <h2>주차 조건을 충족했어요.</h2>
                  <p>위치·각도·정지 확인 완료. P 기어로 마무리하세요.</p>
                  <button className="button orange" onClick={() => shift("P")}>
                    P로 마무리
                  </button>
                </section>
              </div>
            )}
            {state === "finished" && (
              <div className="stage-overlay">
                <section className="result-panel">
                  <div className="result-kicker">
                    <span>RUN / COMPLETE</span>
                    <Flag size={20} />
                  </div>
                  <h2 ref={resultTitle} tabIndex={-1}>
                    {ended === "success"
                      ? "NICE PARK."
                      : ended === "collision"
                        ? "TRY AGAIN."
                        : ended === "timeout"
                          ? "TIME UP."
                          : "GOOD RUN."}
                  </h2>
                  <p>
                    {ended === "success"
                      ? "주차 완료! 같은 공간에서 한 번 더 해볼까요?"
                      : ended === "collision"
                        ? "차체가 장애물 또는 경계에 닿았어요. 다음 시도는 다르게."
                        : ended === "timeout"
                          ? "90초가 지났어요. 같은 환경에서 다시 도전할 수 있어요."
                          : "여기까지의 시도를 확인하고, 다시 도전해보세요."}
                  </p>
                  {ended === "timeout" && driving.parkingStatus && (
                    <p className="parking-timeout-reason">
                      마지막 미충족 조건:{" "}
                      {driving.parkingStatus.ready
                        ? "정지 유지 시간이 부족했어요"
                        : parkingMessage(driving.parkingStatus)}
                    </p>
                  )}
                  <dl className="result-metrics">
                    <div>
                      <dt>종료 사유</dt>
                      <dd>
                        {ended === "success"
                          ? "성공"
                          : ended === "collision"
                            ? "충돌"
                            : ended === "timeout"
                              ? "시간 종료"
                              : "직접 종료"}
                      </dd>
                    </div>
                    <div>
                      <dt>소요 시간</dt>
                      <dd>
                        {(driving.result?.simTimeS ?? 0).toFixed(1)}
                        <small> s</small>
                      </dd>
                    </div>
                    <div>
                      <dt>방향 전환</dt>
                      <dd>
                        {driving.shifts}
                        <small> 회</small>
                      </dd>
                    </div>
                    <div>
                      <dt>최종 위치 오차</dt>
                      <dd>
                        {positionError.toFixed(2)}
                        <small> m</small>
                      </dd>
                    </div>
                  </dl>
                  <div className="result-actions">
                    <button className="button orange" onClick={start}>
                      같은 공간 다시 도전 <RotateCcw size={17} />
                    </button>
                    <button className="button secondary" onClick={leave}>
                      공간 바꾸기 <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <small className="result-note">
                    이번 실행의 실제 측정값 ·{" "}
                    {recordLocally
                      ? "차고의 내 주행 기록에서 저장 상태를 재생할 수 있어요."
                      : "로컬 기록을 꺼서 이번 주행은 보관하지 않았어요."}{" "}
                    같은 공간의 나와 미스터팍 기록을 골라 비교할 수도 있어요.
                  </small>
                  {driving.storageError && (
                    <p role="alert">{driving.storageError}</p>
                  )}
                </section>
              </div>
            )}
          </section>
          <section id="cockpit" className="cockpit" aria-label="운전 조작">
            <div className="telemetry">
              <div className="speedometer">
                <span className="eyebrow">SPEED</span>
                <div>
                  <strong data-testid="speed">{speed.toFixed(1)}</strong>
                  <span>km/h</span>
                </div>
                <div className="speed-track">
                  <i
                    style={{ width: `${Math.min(100, (speed / 5.4) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="telemetry-small">
                <span>
                  SIM TIME{" "}
                  <b data-testid="sim-time">
                    {(driving.result?.simTimeS ?? 0).toFixed(1)} s
                  </b>
                </span>
                <span>
                  위치 오차 <b>{positionError.toFixed(2)} m</b>
                </span>
                <span>
                  각도 오차 <b>{angleError.toFixed(1)}°</b>
                </span>
              </div>
            </div>
            <div className="steering-control">
              <div className="wheel-row">
                {pedal("left", "왼쪽 조향", "A", <ChevronLeft size={23} />)}
                <div
                  className="wheel-display"
                  role="slider"
                  aria-label="드래그 핸들"
                  aria-valuemin={-32}
                  aria-valuemax={32}
                  aria-valuenow={Math.round(
                    ((observation?.steeringRad ?? 0) * 180) / Math.PI,
                  )}
                  aria-valuetext={`조향 ${Math.round(((observation?.steeringRad ?? 0) * 180) / Math.PI)}도`}
                  aria-disabled={controlsDisabled}
                  tabIndex={controlsDisabled ? -1 : 0}
                  onPointerDown={(e) => {
                    if (controlsDisabled) return;
                    wheelDrag.current = {
                      id: e.pointerId,
                      x: e.clientX,
                      value:
                        (observation?.steeringRad ?? 0) /
                        driving.scenario.vehicle.maxSteeringRad,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const drag = wheelDrag.current;
                    if (drag?.id === e.pointerId && !controlsDisabled)
                      driving.steer(
                        Math.max(
                          -1,
                          Math.min(1, drag.value - (e.clientX - drag.x) / 85),
                        ),
                      );
                  }}
                  onPointerUp={() => {
                    wheelDrag.current = null;
                    driving.steer(null);
                  }}
                  onPointerCancel={() => {
                    wheelDrag.current = null;
                    driving.steer(null);
                  }}
                  onLostPointerCapture={() => {
                    wheelDrag.current = null;
                    driving.steer(null);
                  }}
                  onKeyDown={(e) => {
                    if (controlsDisabled) return;
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      e.stopPropagation();
                      driving.press(e.key === "ArrowLeft" ? "left" : "right");
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.stopPropagation();
                      driving.release(e.key === "ArrowLeft" ? "left" : "right");
                    }
                  }}
                  onBlur={() => {
                    if (!wheelDrag.current) driving.steer(null);
                    driving.release("left");
                    driving.release("right");
                  }}
                >
                  <Wheel angle={observation?.steeringRad ?? 0} />
                  <span>
                    조향{" "}
                    {(
                      ((observation?.steeringRad ?? 0) * 180) /
                      Math.PI
                    ).toFixed(0)}
                    °
                  </span>
                  <small>좌우로 드래그</small>
                </div>
                {pedal("right", "오른쪽 조향", "D", <ChevronRight size={23} />)}
              </div>
            </div>
            <div className="gear-control">
              <span className="eyebrow">SELECT GEAR</span>
              <div className="gear-selector" aria-label="변속 기어">
                {(["P", "R", "D"] as const).map((g) => (
                  <button
                    key={g}
                    disabled={
                      mode === "mascot" ||
                      state !== "ready" ||
                      (!!ended && !parkConfirm) ||
                      (parkConfirm && g !== "P")
                    }
                    aria-label={g + " 기어"}
                    aria-pressed={driving.gear === g}
                    onClick={() => shift(g)}
                  >
                    {g}
                    <kbd>{g === "D" ? "E" : g === "R" ? "Q" : "P"}</kbd>
                  </button>
                ))}
              </div>
              <span className="gear-description">
                {driving.gear === "P"
                  ? "주차"
                  : driving.gear === "R"
                    ? "후진"
                    : "전진"}{" "}
                · 정지 후 변속
              </span>
            </div>
            <div className="pedals">
              {pedal(
                "brake",
                "브레이크",
                driving.gear === "R" ? "↑ / S" : "↓ / S",
              )}
              {pedal(
                "throttle",
                "액셀",
                driving.gear === "R" ? "↓ / W" : "↑ / W",
              )}
            </div>
            <div className="run-controls">
              <button
                className="icon-button"
                aria-label="일시정지"
                disabled={state !== "ready" || driving.paused || !!ended}
                onClick={driving.pause}
              >
                <Pause size={21} />
              </button>
              <button
                className="icon-button"
                aria-label="연습 마치기"
                disabled={state !== "ready" || !!ended}
                onClick={() => {
                  driving.stop();
                  setState("finished");
                }}
              >
                <Flag size={19} />
              </button>
              <span>
                SPACE
                <br />
                일시정지
              </span>
            </div>
            <div className="cockpit-status">
              <span role="status">
                {mode === "mascot"
                  ? "정책이 조향·속도를 결정해요. 카메라 변경·일시정지·종료만 가능해요."
                  : driving.message ||
                    "D: ↑ 전진 · R: ↓ 후진 · 반대 방향키 제동 / W 액셀 · S 브레이크"}
              </span>
              <span>
                {sensors
                  ? `중심 센서 최소 거리 ${nearest === null ? "—" : nearest.toFixed(1)} m · 차체 여유 아님`
                  : "센서 표시를 켜면 실제 계산한 거리선을 볼 수 있어요."}
              </span>
            </div>
          </section>
        </main>
      )}
      <dialog
        ref={modal}
        aria-labelledby="dialog-title"
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDialog(null);
        }}
      >
        <div className="dialog-content">
          <button
            className="dialog-close icon-button"
            aria-label="닫기"
            onClick={() => setDialog(null)}
          >
            <X size={22} />
          </button>
          <span className="eyebrow">
            {dialog === "guide" ? "BEFORE YOU DRIVE" : "WHY WE BUILD"}
          </span>
          <h2 id="dialog-title">
            {dialog === "guide"
              ? "기어를 넣고, 천천히."
              : "시도를 쌓는 주차장."}
          </h2>
          {dialog === "guide" ? (
            <>
              <p>
                실제 자동차 전체를 재현한 제품이 아닌 저속 주차
                시뮬레이션이에요.
              </p>
              <ol className="guide-list">
                <li>
                  <b>01</b>
                  <div>
                    <strong>멈춘 상태에서 D / R을 선택해요.</strong>
                    <p>
                      단축키 E 전진·Q 후진·P 주차. 움직이는 동안은 변속할 수
                      없어요. P에서는 액셀을 눌러도 움직이지 않아요.
                    </p>
                  </div>
                </li>
                <li>
                  <b>02</b>
                  <div>
                    <strong>D에서는 ↑ 전진, R에서는 ↓ 후진.</strong>
                    <p>
                      기어와 반대 방향키는 브레이크예요. W는 기어에 관계없이
                      액셀, S는 항상 브레이크예요. 방향키로 기어가 자동
                      변경되지는 않아요.
                    </p>
                  </div>
                </li>
                <li>
                  <b>03</b>
                  <div>
                    <strong>A / D로 핸들을 돌려요.</strong>
                    <p>
                      길게 누를수록 점진적으로 꺾여요. 놓으면 중앙으로 돌아오는
                      보조가 적용돼요. 화면 핸들을 좌우로 드래그해도 돼요.
                      모바일은 한 손으로 핸들, 다른 손으로 페달을 조작하세요.
                    </p>
                  </div>
                </li>
                <li>
                  <b>04</b>
                  <div>
                    <strong>표시된 칸에 정차하고 P로 마무리.</strong>
                    <p>
                      Space나 상단 가이드로 쉬어갈 수 있어요. 센서 패널은 광선
                      방향의 차체 여유를 표시해요. 센서 경고음은 버튼으로 켤 수
                      있으며 안전을 보장하지 않아요.
                    </p>
                  </div>
                </li>
              </ol>
            </>
          ) : (
            <>
              <p>
                내가 운전한 공간에서 AI 친구 미스터팍도 운전해보면 어떨까요?
                서로 다른 시도와 실패를 관찰할 수 있는 참여형 주차 실험실을 만들고 있어요.
              </p>
              <p>
                직접 운전·거리 센서·맵 편집·로컬 기록 재생과 비교를 제공해요.
                미스터팍은 실제 학습 모델로 운전하지만 초기 모델이라 실패할 수
                있어요. 학습용 전송을 선택한 뒤 시작한 완료 기록만 수집해요. 참여 수가
                늘었다고 모델 성능이 자동으로 좋아졌다고 표현하지 않습니다.
              </p>
              <p className="dialog-note">
                Mr.Park(미스터팍)은 직접 운전하고 AI의 도전도 관찰하는 가상
                주차 실험실이에요. 동의하지 않은 주행은 서버에 전송하지 않습니다.
                실제 운전 교육 효과와 실차 안전성은 검증하지 않았습니다.
              </p>
              <a
                className="text-link"
                href="https://github.com/yumina0616/ai-championship-2026"
                target="_blank"
                rel="noreferrer"
              >
                개발 저장소 보기 <ArrowUpRight size={16} />
              </a>
            </>
          )}
          <button className="button orange" onClick={() => setDialog(null)}>
            알겠어요 <ArrowRight size={18} />
          </button>
        </div>
      </dialog>
    </div>
  );
}
