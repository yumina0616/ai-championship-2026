import { useEffect, useRef, useState } from "react";
import { ArrowRight, HardDrive, Radio, X } from "lucide-react";
import type { useCollection } from "./collection";
import { NOTICE_VERSION } from "./collection-record";

export const RECORD_CHOICE_KEY = "mrpark-record-choice";
export const RECORD_CHOICE_VERSION = NOTICE_VERSION;

export default function RecordChoice({ collection, local, settings, onConfirm, onCancel }: {
  collection: ReturnType<typeof useCollection>;
  local: boolean;
  settings: boolean;
  onConfirm: (local: boolean, share: boolean) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [keep, setKeep] = useState(local);
  const [share, setShare] = useState(collection.enabled && local);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="record-choice" aria-labelledby="record-choice-title" onCancel={onCancel}>
    <button className="dialog-close icon-button" aria-label="기록 선택 닫기" onClick={onCancel}><X size={20} /></button>
    <span className="eyebrow">{settings ? "YOUR RECORD SETTINGS" : "BEFORE THE FIRST DRIVE"}</span>
    <h2 id="record-choice-title">이번 주행,<br /><em>어떻게 남길까요?</em></h2>
    <p className="record-intro">선택하지 않아도 모든 운전을 즐길 수 있어요.</p>
    <label className={`record-option ${keep ? "chosen" : ""}`}>
      <HardDrive aria-hidden="true" /><span><strong>이 브라우저에 주행 기록 보관</strong><small>최근 5회 · 다시 보기와 비교용 · 서버 전송 없음</small></span>
      <input type="checkbox" aria-label="이 브라우저에 주행 기록 보관" checked={keep} onChange={e => { setKeep(e.target.checked); if (!e.target.checked) setShare(false); }} />
    </label>
    <label className={`record-option ${share ? "chosen" : ""}${!collection.available ? " unavailable" : ""}`}>
      <Radio aria-hidden="true" /><span><strong>미스터팍 학습에도 보태기</strong>{!collection.available && <span className="record-availability">현재 이용 불가</span>}<small>{collection.available ? "다음 주행부터 완료한 기록을 비공개 서버에 자동 전송" : "수집 서버에 연결되지 않았어요. 브라우저 보관은 가능해요."}</small></span>
      <input type="checkbox" aria-label="학습용 기록 전송에 동의하고 켜기" aria-describedby="record-sharing-notice" checked={share && collection.available}
        disabled={!collection.available || collection.busy} onChange={e => { setShare(e.target.checked); if (e.target.checked) setKeep(true); }} />
    </label>
    <p id="record-sharing-notice" className="record-notice">전송 항목: 가상 환경·센서·조작·결과. 원본 30일 보관 후 삭제하며, 검증 후 학습에 사용할 수 있어요.
      이름·계정·실제 위치는 보내지 않아요. 브라우저 보관도 함께 켜져요.</p>
    <details className="collection-details"><summary>수집 내용 · 기록 삭제</summary>
      <p>동의 이후 시작한 주행만 대상이에요. 과거·불완전 기록은 전송하지 않아요. 전송이 곧바로 모델 업데이트를 뜻하지는 않아요.
        설정에서 언제든 끌 수 있으며, 끄더라도 이미 보관한 기록은 유지돼요.</p>
      <button className="text-link" disabled={collection.busy} onClick={() => { setShare(false); void collection.remove(); }}>
        {collection.busy ? "서버 기록 삭제 중" : "전송 끄고 이 브라우저의 서버 기록 삭제"}
      </button>
      <p><a href="/data-notice.html" target="_blank" rel="noreferrer">수집·삭제 안내</a> · <a href="mailto:jinhyeong9568@gmail.com">비공개 문의</a></p>
      {collection.message && <p role="status">{collection.message}</p>}
    </details>
    <div className="record-choice-actions">
      <button className="button" disabled={collection.busy} onClick={() => onConfirm(false, false)}>기록 없이 {settings ? "설정" : "시작"}</button>
      <button className="button" disabled={!keep || collection.busy} onClick={() => onConfirm(keep, keep && share && collection.available)}>
        {settings ? "선택 저장" : "선택하고 시작하기"}<ArrowRight size={17} />
      </button>
    </div>
    <small className="record-choice-footnote">이 브라우저에 선택을 기억해요. ‘기록 설정’에서 다시 변경할 수 있어요.</small>
  </dialog>;
}
