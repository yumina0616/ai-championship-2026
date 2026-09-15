import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import SensorAssist from "./SensorAssist";
const ParkingScene = lazy(() => import("./ParkingScene"));

function Logo() {
  return (
    <span className="wordmark">
      <span className="logo-mark">
        <Route size={22} />
      </span>
      parkside<span className="wordmark-period">.</span>
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
  const [mode, setMode] = useState<Mode>("human");
  const [camera, setCamera] = useState<CameraMode>("orbit");
  const [sensors, setSensors] = useState(false);
  const [grid, setGrid] = useState(false);
  const [state, setState] = useState<PreviewState>("idle");
  const [error, setError] = useState("");
  const [sceneRevision, setSceneRevision] = useState(0);
  const [dialog, setDialog] = useState<"guide" | "about" | null>(null);
  const [reduceMotion, setReduceMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [motionPaused, setMotionPaused] = useState(false);
  const [hasDriven, setHasDriven] = useState(false);
  const [sceneBox, setSceneBox] = useState({
    top: 0,
    height: window.innerHeight,
  });
  const driving = useDriving(template);
  const wheelDrag = useRef<{ id: number; x: number; value: number } | null>(
    null,
  );
  const abort = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const modal = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const driveTitle = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const garageStart = useRef<HTMLButtonElement>(null);
  const sceneFailed = useCallback(() => {
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
    state === "ready" && ended === "success" && driving.gear !== "P";
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
  const controlsDisabled = state !== "ready" || driving.paused || !!ended;

  // 같은 Canvas를 유지하고 표시 영역만 옮겨 카메라/조명 문맥이 끊기지 않게 합니다.
  useLayoutEffect(() => {
    const area = document.querySelector(
      view === "landing" ? ".hero" : ".driving-stage",
    );
    if (!area) return;
    const measure = () => {
      const rect = area.getBoundingClientRect();
      setSceneBox({ top: rect.top + window.scrollY, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [view]);

  useEffect(() => {
    setCamera((current) =>
      current === "follow" || current === "rear"
        ? driving.gear === "R"
          ? "rear"
          : "follow"
        : current,
    );
  }, [driving.gear]);
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
    setMode("human");
    if (state === "error") setSceneRevision((n) => n + 1);
    setHasDriven(true);
    const cinematicEntry = view === "landing" && !reduceMotion && !motionPaused;
    const began = performance.now();
    const id = ++requestId.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setView("drive");
    setState("loading");
    setError("");
    setCamera("follow");
    driving.reset();
    window.scrollTo({ top: 0, behavior: "instant" });
    const timeout = window.setTimeout(() => controller.abort("timeout"), 8000);
    try {
      await loadPreview(controller.signal);
      if (cinematicEntry && !controller.signal.aborted) {
        await new Promise<void>((resolve) => {
          const done = () => {
            window.clearTimeout(timer);
            controller.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = window.setTimeout(
            done,
            Math.max(0, 1200 - (performance.now() - began)),
          );
          controller.signal.addEventListener("abort", done, { once: true });
        });
      }
      if (id === requestId.current) {
        driving.start();
        setState("ready");
      }
    } catch {
      if (id === requestId.current) {
        setError(
          controller.signal.reason === "timeout"
            ? "응답이 늦어지고 있어요. 다시 시도해주세요."
            : "실행 리소스를 불러오지 못했어요. 인터넷 연결을 확인해주세요.",
        );
        setState("error");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function leave() {
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
        (motionPaused ? " motion-paused" : "")
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
            result={driving.result}
            cameraMode={view === "landing" ? "orbit" : camera}
            sensors={sensors}
            grid={view === "drive" && grid}
            reducedMotion={reduceMotion || motionPaused}
            brake={driving.held.includes("brake")}
            reverse={driving.gear === "R"}
            driving={view === "drive"}
            onUnavailable={view === "drive" ? sceneFailed : undefined}
          />
        </Suspense>
      </div>
      {!hasDriven && (
        <div className="opening-signature" aria-hidden="true">
          <span>PARKSIDE</span>
          <small>A PHYSICAL AI EXPERIMENT</small>
        </div>
      )}
      <a
        className="skip-link"
        href={view === "landing" ? "#garage" : "#cockpit"}
      >
        조작 영역으로 바로가기
      </a>
      {view === "landing" ? (
        <>
          <header className="site-header">
            <a href="#" aria-label="PARKSIDE 홈">
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
            <section className="hero" aria-labelledby="hero-title">
              <div className="hero-topline">
                <span>THE PARKING PLAYGROUND</span>
                <span>
                  작은 공간, 무한한 시도. <MoveUpRight size={14} />
                </span>
              </div>
              <div className="hero-copy">
                <div className="edition-label">
                  <span className="outline-label">
                    A PHYSICAL AI DRIVING EXPERIENCE
                  </span>
                </div>
                <h1 id="hero-title" aria-label="주차를 플레이하다.">
                  <span>Every move.</span>
                  <span className="outline-type">
                    A possibility<span className="title-dot">.</span>
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
                <div className="hero-actions">
                  <button className="button orange" onClick={start}>
                    바로 운전하기 <ArrowUpRight size={21} />
                  </button>
                  <a className="text-link" href="#garage">
                    다른 공간 고르기 <ArrowDown size={16} />
                  </a>
                </div>
                <p className="hero-footnote">
                  설치 없음 · 키보드 & 터치 · 실제 가상 센서
                </p>
              </div>
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
              <div className="hero-bottom">
                <span>
                  <span className="dot orange-dot" /> 현재 실행 가능한 주차 실험
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
                  지금은 3개의 고정 환경. 자유 편집은 준비 중이에요.
                </p>
              </div>
              <fieldset className="mission-list">
                <legend className="sr-only">주차 환경 선택</legend>
                {templates.map((t, i) => (
                  <label
                    className={
                      "mission " + (template === t.id ? "selected" : "")
                    }
                    key={t.id}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={template === t.id}
                      onChange={() => setTemplate(t.id)}
                      aria-label={t.title}
                    />
                    <div className="mission-header">
                      <span>EXPERIMENT / 0{i + 1}</span>
                      <span className="mission-check">
                        {template === t.id ? (
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
                    마스코트 <small>준비 중</small>
                  </label>
                </fieldset>
                <button
                  ref={garageStart}
                  className="button orange"
                  disabled={mode === "mascot"}
                  onClick={start}
                >
                  {mode === "human" ? "이 공간에서 시작" : "학습 모델 준비 중"}
                  <ArrowRight size={19} />
                </button>
              </div>
              {mode === "mascot" && (
                <p className="availability" role="status">
                  마스코트는 아직 운전하지 않아요. 학습한 정책을 연결한 뒤 같은
                  환경에서 관찰할 수 있어요.
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
                  내가 직접 운전하고, 언젠가는 AI 친구도 같은 공간에 도전하고.
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
                  <span className="planned">
                    <b>03</b> AI와 비교 <small>예정</small>
                  </span>
                </div>
              </div>
              <div className="buddy-board">
                <span className="buddy-label">YOUR NEXT CO-DRIVER</span>
                <Buddy />
                <div>
                  <strong>미래에서 온 주차 초보.</strong>
                  <p>아직 면허 연습 중. 학습 모델 연결 예정이에요.</p>
                </div>
                <span className="board-corner">COMING TO THE GARAGE ↗</span>
              </div>
            </section>
            <footer className="site-footer">
              <Logo />
              <p>
                가상 환경의 실험입니다. 실제 차량 제어·운전 교육을 대신하지
                않습니다.
                <br />
                현재 주행 데이터는 서버에 저장하거나 전송하지 않습니다.
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
                {selected.title}
              </h1>
              <p>
                <Flag size={13} /> 표시된 칸에 정차한 뒤 P로 마무리
              </p>
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
              <div className="park-confirm" role="status">
                <Check size={19} /> 위치 확인 완료. P 기어를 선택해 주차를
                마무리하세요.
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
                    이번 실행의 실제 측정값 · 기록 저장/AI 비교는 아직 제공하지
                    않아요.
                  </small>
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
              {pedal("brake", "브레이크", "S")}
              {pedal("throttle", "액셀", "W")}
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
                {driving.message ||
                  "E 전진 · Q 후진 → W 액셀 / S 브레이크 / A·D 또는 드래그 조향"}
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
                    <strong>W는 액셀, S는 브레이크.</strong>
                    <p>
                      S는 후진이 아니에요. 후진하려면 R을 선택한 뒤 액셀을
                      누르세요. 페달을 놓으면 서서히 감속해요.
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
                내가 운전한 공간에서 AI 친구도 운전해보면 어떨까요? 서로 다른
                시도와 실패를 관찰할 수 있는 참여형 주차 실험실을 만들고 있어요.
              </p>
              <p>
                지금은 직접 운전·거리 센서·결과 확인이 동작합니다. 학습된
                마스코트, 자유 편집, 기록 기여와 비교는 개발 예정이에요. 참여
                수가 늘었다고 모델 성능이 자동으로 좋아졌다고 표현하지 않습니다.
              </p>
              <p className="dialog-note">
                PARKSIDE는 임시 이름입니다. 주행 데이터는 서버에 전송하지
                않습니다. 실제 운전 교육 효과와 실차 안전성은 검증하지
                않았습니다.
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
