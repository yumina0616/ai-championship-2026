import { Children, isValidElement, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

// 장식 전용 곡선. 실제 센서·정책 출력으로 사용하거나 표시하지 않는다.
export function SignalField({ tone = "ice" }: { tone?: "ice" | "amber" | "silver" }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      node.classList.toggle("field-visible", entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div className={`signal-field signal-${tone}`} ref={ref} aria-hidden="true">
    <div className="field-halo" /><div className="field-grid" />
    <svg viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox">
        <stop stopColor="currentColor" stopOpacity="0" /><stop offset=".45" stopColor="currentColor" stopOpacity=".65" /><stop offset=".7" stopColor="#e3f7ff" stopOpacity=".8" /><stop offset="1" stopColor="currentColor" stopOpacity="0" />
      </linearGradient></defs>
      <g className="field-ribbons" fill="none" stroke={`url(#${id})`} strokeWidth=".8">
        {Array.from({ length: 28 }, (_, i) => <path key={i} d={`M -120 ${600 + i * 7} C 270 ${-80 + i * 16}, 660 ${1040 - i * 19}, 1010 ${360 - i * 4} S 1490 ${-40 + i * 7}, 1600 ${90 + i * 8}`} />)}
      </g>
      <g className="field-orbits" fill="none" stroke="currentColor" strokeWidth=".6" opacity=".2">
        {[220, 280, 350].map(r => <ellipse key={r} cx="1080" cy="370" rx={r} ry={r * .72} transform="rotate(-28 1080 370)" />)}
        <path d="M720 370h720M1080 0v800" strokeDasharray="2 10" />
      </g>
      <g className="field-stars" fill="currentColor">{Array.from({ length: 18 }, (_, i) => <circle key={i} cx={(i * 347 + 90) % 1440} cy={(i * 137 + 75) % 800} r={i % 3 === 0 ? 2 : 1} />)}</g>
    </svg>
  </div>;
}

// 첫 진입에만 재생. 텍스트는 처음부터 DOM에 있고 읽기·선택·검색을 유지한다.
export function RevealText({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lines: ReactNode[][] = [[]];
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === "br") lines.push([]);
    else lines[lines.length - 1].push(child);
  }
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // 이미 화면에 있는 문장을 갑자기 숨기지 않는다. 아래 문장만 진입을 준비한다.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || node.closest(".motion-paused")) return;
    if (node.getBoundingClientRect().top > innerHeight) node.classList.add("text-pending");
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.remove("text-pending"); node.classList.add("text-entered"); observer.disconnect();
      }
    }, { threshold: .08, rootMargin: "0px 0px -24px 0px" });
    observer.observe(node);
    // 모션 설정을 바꿔도 보이지 않는 문장을 남기지 않는다.
    const reveal = () => { node.classList.remove("text-pending"); };
    const app = node.closest(".cinema");
    const state = new MutationObserver(() => { if (app?.classList.contains("motion-paused")) reveal(); });
    if (app) state.observe(app, { attributes: true, attributeFilter: ["class"] });
    reduced.addEventListener("change", reveal);
    return () => { observer.disconnect(); state.disconnect(); reduced.removeEventListener("change", reveal); };
  }, []);
  return <span ref={ref} className="reveal-text" style={{ "--reveal-delay": `${Math.min(180, Math.max(0, delay))}ms` } as CSSProperties}>
    {lines.map((line, index) => <span className="reveal-line" key={index}><span className="reveal-line-inner" style={{ "--line-delay": `${Math.min(index, 3) * 90}ms` } as CSSProperties}>{line}{index < lines.length - 1 ? " " : null}</span></span>)}
  </span>;
}

export function SignalRibbon() {
  return <div className="signal-ribbon" aria-hidden="true"><div>
    {[0, 1].map(i => <span key={i}>SPACE <b>↗</b> SENSE <b>✳</b> STEER <b>↗</b> TRY AGAIN <b>✳</b> </span>)}
  </div><small>THE PHYSICAL AI PLAYGROUND</small></div>;
}

export function LaunchLoader({ onLowQuality }: { onLowQuality: () => void }) {
  return <div className="launch-loader" role="status" aria-label="고화질 차량 준비 중">
    <SignalField tone="ice" />
    <div className="loader-instrument" aria-hidden="true"><i /><i /><i /><span>P.</span></div>
    <div className="loader-copy"><span>MR.PARK / IGNITION SEQUENCE</span><strong>당신의 차를 준비하고 있어요.</strong>
      <p>고화질 3D 모델을 불러오는 중이에요.</p>
      <div className="loader-track" aria-hidden="true"><i /></div>
      <button onClick={onLowQuality}>가볍게 시작하기 <span>↗</span></button>
    </div>
  </div>;
}

// 랜딩의 카드/버튼에만 조명을 추적한다. 주행, 터치, 모션 감소에서는 설치하지 않는다.
export function useSurfaceMotion(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const media = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0, x = 0, y = 0, current: HTMLElement | null = null;
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0;
      current?.style.removeProperty("--tilt-x"); current?.style.removeProperty("--tilt-y");
      current?.removeAttribute("data-lit"); current = null;
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".landing .mission, .landing .mascot-portrait, .landing .button, .landing .end-drive") : null;
      if (target !== current) { reset(); current = target; }
      if (!current) return;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!current) return;
        const rect = current.getBoundingClientRect();
        const px = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        const py = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
        current.style.setProperty("--light-x", `${px * 100}%`);
        current.style.setProperty("--light-y", `${py * 100}%`);
        current.style.setProperty("--tilt-x", `${(py - .5) * -5}deg`);
        current.style.setProperty("--tilt-y", `${(px - .5) * 5}deg`);
        current.dataset.lit = "true";
      });
    };
    const visibility = () => { document.documentElement.classList.toggle("page-hidden", document.hidden); if (document.hidden) reset(); };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      reset(); document.documentElement.classList.remove("page-hidden");
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", visibility);
    };
  }, [active]);
}

export function SectionNumber({ number, label }: { number: string; label: string }) {
  return <div className="section-index" aria-hidden="true" style={{ "--section-number": `"${number}"` } as CSSProperties}><span>{number}</span><i /><small>{label}</small></div>;
}
