import { useState } from "react";
import { ArrowRight, Radar, X } from "lucide-react";

const steps = [
  { title: "우선, D 기어부터.", text: "아래 D를 누르거나 E 키를 눌러요. ↑는 전진, ← →는 핸들. 움직이는 동안은 기어를 바꿀 수 없어요." },
  { title: "보이지 않는 거리도 보여요.", text: "‘센서 표시’를 켜면 가상 광선과 장애물까지의 거리가 보여요. 소리는 센서 패널에서 직접 켤 수 있어요. 실제 차량 안전 기준은 아니에요." },
  { title: "뒤가 궁금하면, 카메라.", text: "운전석·탑뷰로 시점을 바꾸고 후방 카메라를 켜보세요. R에서는 ↓로 후진해요. 칸 안에 멈춘 뒤 P로 마무리하면 돼요." },
];

export default function DriveWelcome({ onSensors, hidden = false }: { onSensors: () => void; hidden?: boolean }) {
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(() => {
    try { return localStorage.getItem("mrpark-drive-welcome") === "done"; } catch { return false; }
  });
  function close() {
    setClosed(true);
    try { localStorage.setItem("mrpark-drive-welcome", "done"); } catch { /* 이번 탭에서만 닫기 */ }
  }
  if (closed || hidden) return null;
  return <aside className="drive-welcome" aria-label="첫 운전 안내" data-step={step}>
    <div className="welcome-top"><span>MR.PARK’S QUICK START</span><button aria-label="첫 운전 안내 닫기" onClick={close}><X size={15} /></button></div>
    <div className="welcome-eyes" aria-hidden="true"><i /><i /></div>
    <strong>{steps[step].title}</strong><p>{steps[step].text}</p>
    <div className="welcome-actions"><span>{step + 1} / 3</span>
      {step === 1 && <button onClick={() => { onSensors(); setStep(2); }}><Radar size={13} /> 센서 켜보기</button>}
      <button onClick={() => step === 2 ? close() : setStep(step + 1)}>{step === 2 ? "출발해볼게요" : "다음"}<ArrowRight size={14} /></button>
    </div>
  </aside>;
}
