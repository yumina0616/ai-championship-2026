import { useEffect, useRef, useState } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** 한 편의 브랜드 필름을 스크롤로 탐색한다. 실제 센서/정책 실행 영상이 아니다. */
export default function ScrollFilmBackdrop({ motionOff }: { motionOff: boolean }) {
  const host = useRef<HTMLDivElement>(null), film = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = host.current, video = film.current;
    if (!node || !video) return;
    let target = 0, frame = 0, visible = false, reaction = 0;
    const clearReaction = () => {
      window.clearTimeout(reaction); node.dataset.reaction = "idle";
      node.style.setProperty("--film-focus-x","0px"); node.style.setProperty("--film-focus-y","0px");
    };
    const seek = () => {
      frame = 0;
      if (motionOff || failed || !visible || document.hidden || video.seeking || video.readyState < 2 || !Number.isFinite(video.duration)) return;
      const desired = target * Math.max(0,video.duration - .08), distance = desired - video.currentTime;
      if (Math.abs(distance) < .045) return;
      // 키프레임 간격이 짧은 MP4. 한 번에 하나만 seek하고 최신 스크롤 위치로 합친다.
      video.currentTime += Math.abs(distance) > 2 ? distance : distance * .45;
    };
    const schedule = () => { if (!frame && !motionOff && !document.hidden) frame = requestAnimationFrame(seek); };
    const scroll = () => {
      const height = innerHeight, hero = document.querySelector(".hero");
      const bottom = hero?.getBoundingClientRect().bottom ?? 0;
      const start = (hero?.getBoundingClientRect().height ?? height) * .6;
      visible = bottom < height * .95;
      target = clamp((scrollY - start) / Math.max(1,document.documentElement.scrollHeight - height - start));
      node.dataset.phase = target.toFixed(3); node.dataset.visible = String(visible);
      node.style.opacity = String(clamp((height - bottom) / (height * .55)));
      if (visible && !motionOff && !failed) setLoad(true);
      if (!visible || motionOff || document.hidden) { cancelAnimationFrame(frame); frame = 0; clearReaction(); }
      else schedule();
    };
    const click = (e: MouseEvent) => {
      const button = e.target instanceof Element ? e.target.closest<HTMLElement>("button,a[href],summary,.mission") : null;
      if (!visible || motionOff || document.hidden || !button || button.closest("dialog,.drive") || button.matches(":disabled")) return;
      const r = button.getBoundingClientRect(), x = r.left+r.width/2, y = r.top+r.height/2;
      clearReaction(); node.dataset.reaction = "active";
      node.dataset.originX = String(Math.round(x)); node.dataset.originY = String(Math.round(y));
      node.style.setProperty("--film-focus-x",`${(innerWidth/2-x)*.018}px`);
      node.style.setProperty("--film-focus-y",`${(innerHeight/2-y)*.012}px`);
      reaction = window.setTimeout(clearReaction,1100);
    };
    const resize = new ResizeObserver(scroll); resize.observe(document.body);
    window.addEventListener("scroll",scroll,{passive:true}); window.addEventListener("resize",scroll);
    document.addEventListener("visibilitychange",scroll); document.addEventListener("click",click,true);
    video.addEventListener("loadeddata",schedule); video.addEventListener("canplay",schedule); video.addEventListener("progress",schedule); video.addEventListener("seeked",schedule);
    node.dataset.motion = motionOff ? "paused" : "running"; clearReaction(); scroll();
    return () => {
      cancelAnimationFrame(frame); clearReaction(); resize.disconnect();
      window.removeEventListener("scroll",scroll); window.removeEventListener("resize",scroll);
      document.removeEventListener("visibilitychange",scroll); document.removeEventListener("click",click,true);
      video.removeEventListener("loadeddata",schedule); video.removeEventListener("canplay",schedule); video.removeEventListener("progress",schedule); video.removeEventListener("seeked",schedule);
    };
  }, [motionOff,failed]);
  return <div ref={host} className="continuous-backdrop" data-kind="scroll-brand-film" data-ready={ready && !failed} aria-hidden="true">
    <img src="/art/mrpark-concept.png" alt="" />
    <video ref={film} src={load && !failed ? "/art/parking-scroll-film.mp4" : undefined} muted playsInline preload="auto"
      onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />
    <div className="film-scrim" />
  </div>;
}
