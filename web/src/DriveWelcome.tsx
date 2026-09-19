import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Radar, X, MoveHorizontal, ScanLine } from "lucide-react";

const steps = [
  { title: "D를 넣고, ↑로 출발.", text: "아래 D 버튼 또는 E 키. ← →로 조향해요.", cue: "기어는 멈춘 상태에서만 바꿀 수 있어요." },
  { title: "거리도 눈으로 확인해요.", text: "센서를 켜면 주변 장애물까지의 거리가 보여요.", cue: "가상 센서예요. 실제 차량의 안전 기준은 아니에요." },
  { title: "R에서는 ↓로 후진.", text: "후방 카메라로 확인하고, 칸 안에 정차한 뒤 P.", cue: "운전을 시작하면 이 안내는 자동으로 사라져요." },
];

export default function DriveWelcome({ onSensors, hidden = false, moving = false, gear = "P", forceShow = false }: { onSensors: () => void; hidden?: boolean; moving?: boolean; gear?: string; forceShow?: boolean }) {
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(() => {
    try { return !forceShow && localStorage.getItem("mrpark-drive-welcome") === "done"; } catch { return false; }
  });
  const close = useCallback(() => {
    setClosed(true);
    try { localStorage.setItem("mrpark-drive-welcome", "done"); } catch { /* 이번 탭에서만 닫기 */ }
  }, []);
  useEffect(() => { if (gear !== "P") setStep(current => current === 0 ? 1 : current); }, [gear]);
  useEffect(() => {
    if (!moving || hidden || closed) return;
    const timer = window.setTimeout(close, 1000);
    return () => window.clearTimeout(timer);
  }, [moving, hidden, closed, close]);
  if (closed || hidden) return null;
  return <aside className="drive-welcome" aria-label="첫 운전 안내" data-step={step}>
    <div className="welcome-top"><span>MR.PARK’S QUICK START</span><button aria-label="첫 운전 안내 닫기" onClick={close}><X size={15} /></button></div>
    <div className="welcome-progress" aria-label={`${step + 1} / 3 단계`}>{steps.map((_, i) => <i key={i} data-active={i <= step} />)}</div>
    <div className="welcome-step" key={step} aria-live="polite" aria-atomic="true">
      <div className={`welcome-demo demo-${step}`} aria-hidden="true">
        {step === 0 ? <><kbd>D</kbd><ArrowRight /><kbd>↑</kbd><MoveHorizontal /></> : step === 1 ? <><Radar size={38} /><span className="demo-rays"><i /><i /><i /></span><ScanLine size={32} /></> : <><kbd>R</kbd><kbd>↓</kbd><ArrowRight /><kbd>P</kbd></>}
      </div>
      <strong>{steps[step].title}</strong><p>{steps[step].text}</p><small>{steps[step].cue}</small>
    </div>
    <div className="welcome-actions"><span>{step + 1} / 3</span>
      {step === 1 && <button onClick={() => { onSensors(); setStep(2); }}><Radar size={13} /> 센서 켜보기</button>}
      <button onClick={() => step === 2 ? close() : setStep(step + 1)}>{step === 2 ? "출발해볼게요" : "다음"}<ArrowRight size={14} /></button>
    </div>
  </aside>;
}
