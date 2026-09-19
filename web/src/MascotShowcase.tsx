import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

// 생성한 브랜드 필름. 실제 주차 정책·센서·학습 결과와 분리한다.
export default function MascotShowcase({ motionOff }: { motionOff: boolean }) {
  const host = useRef<HTMLElement>(null), video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false), [hidden, setHidden] = useState(document.hidden);
  const [paused, setPaused] = useState(false), [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false), [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false), [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: .15 });
    if (host.current) observer.observe(host.current);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => { if (visible && !motionOff) setLoaded(true); }, [visible, motionOff]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (loaded && visible && !hidden && !motionOff && !paused && !failed && !blocked) {
      let cancelled = false;
      void el.play().catch((error: DOMException) => {
        if (!cancelled && error.name !== "AbortError") setBlocked(true);
      });
      return () => { cancelled = true; el.pause(); };
    }
    el.pause();
  }, [loaded, visible, hidden, motionOff, paused, failed, blocked]);
  const play = () => {
    setPaused(false); setBlocked(false);
    // 모바일 자동재생 차단 시 사용자 제스처 안에서 재시도한다.
    void video.current?.play().catch(() => setBlocked(true));
  };
  return <figure ref={host} className="mascot-showcase" aria-label="움직이는 미스터팍 캐릭터">
    <div className="mascot-stage" data-animate={playing}>
      <img className={ready && !failed ? "mascot-poster ready" : "mascot-poster"} src="/art/mrpark-concept.png" width="1672" height="941" loading="lazy"
        alt="은색 자동차 옆에서 손을 흔드는 미스터팍의 디자인 콘셉트" />
      <video ref={video} className="mascot-film" src={loaded ? "/art/mrpark-film.mp4" : undefined}
        muted loop playsInline preload="none" aria-label="미스터팍 AI 생성 브랜드 필름"
        onLoadedData={() => setReady(true)} onPlaying={() => { setPlaying(true); setBlocked(false); }}
        onPause={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }} />
      <div className="mascot-stage-label"><span>MEET MR.PARK</span><span>BRAND FILM / 01</span></div>
      <span className="mascot-wordmark" aria-hidden="true">Hello, human.</span>
    </div>
    <figcaption className="mascot-caption">
      <div><strong>미래에서 온 주차 초보.</strong><small>{failed ? "영상을 불러오지 못해 콘셉트 이미지를 표시해요." : "AI 생성 브랜드 필름 · 실제 주행 화면이 아니에요."}</small></div>
      <div className="mascot-actions">
        <button type="button" disabled={motionOff || failed || !ready} onClick={() => { if (video.current) video.current.currentTime = 0; play(); }}><RotateCcw size={15} />다시 보기</button>
        <button type="button" className="mascot-pause" aria-label={playing ? "캐릭터 영상 멈추기" : "캐릭터 영상 재생"} aria-pressed={!playing}
          disabled={motionOff || failed || !loaded} onClick={() => { if (playing) setPaused(true); else play(); }}>
          {playing ? <Pause size={16} /> : <Play size={16} />}<span>{playing ? "일시정지" : "재생"}</span>
        </button>
      </div>
      {(motionOff || blocked) && <small className="film-status" role="status">{motionOff ? "모션이 꺼져 있어 영상은 멈춰 있어요." : "재생을 눌러 미스터팍을 만나보세요."}</small>}
    </figcaption>
  </figure>;
}
