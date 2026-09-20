import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalEpisode } from "./episodes";
import { collectionRecord, COLLECTION_BYTES, NOTICE_VERSION } from "./collection-record";

const CONSENT = "mr-park-learning-consent";
const RECEIPTS = "mr-park-learning-receipts";
type Receipt = { token: string; day: string };
type UploadResult = { episodeId: string; status: "sending" | "stored" | "failed" | "deleted"; message?: string };
function receipts(): Receipt[] {
  const value = JSON.parse(localStorage.getItem(RECEIPTS) ?? "[]");
  if (!Array.isArray(value) || value.length > 1000 || value.some(r =>
    !/^[a-f0-9]{64}$/.test(r?.token) || !/^\d{4}-\d{2}-\d{2}$/.test(r?.day))) throw Error("삭제 영수증 저장소를 확인해주세요.");
  return value;
}
async function updateReceipts(update: (all: Receipt[]) => Receipt[]) {
  if (!navigator.locks) throw Error("이 브라우저에서는 삭제 영수증을 안전하게 보관할 수 없어 전송하지 않아요.");
  await navigator.locks.request(RECEIPTS, () => {
    localStorage.setItem(RECEIPTS, JSON.stringify(update(receipts())));
  });
}
export function useCollection() {
  const [available, setAvailable] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);
  const allowed = useRef(false);
  const pending = useRef(new Set<Promise<void>>());
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== CONSENT && event.key !== null) return;
      const on = available && event.newValue === NOTICE_VERSION;
      allowed.current = on; setConsent(on);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [available]);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/collection", { signal: abort.signal, credentials: "omit", cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(config => {
        if (abort.signal.aborted) return;
        const ready = config?.enabled === true && config.noticeVersion === NOTICE_VERSION;
        setAvailable(ready);
        try { const on = ready && localStorage.getItem(CONSENT) === NOTICE_VERSION; setConsent(on); allowed.current = on; }
        catch { setMessage("설정을 보관할 수 없어 서버 전송을 끈 상태예요."); }
      }).catch(() => { /* 미배포/로컬/오프라인은 수집하지 않는다. */ });
    return () => abort.abort();
  }, []);
  const changeConsent = (on: boolean) => {
    try {
      localStorage.setItem(CONSENT, on ? NOTICE_VERSION : "off");
      setConsent(on); allowed.current = on && available;
      setMessage(on ? "다음에 시작하는 주행부터 완료 후 자동 전송해요." : "새 전송을 껐어요. 이미 전송한 기록은 아래 삭제 버튼으로 지울 수 있어요.");
    } catch { allowed.current = false; setConsent(false); setMessage("설정 저장에 실패해 전송하지 않아요."); }
  };
  const upload = useCallback((episode: LocalEpisode) => {
    if (!allowed.current || !episode.steps.length || !episode.footer.logComplete) return;
    const episodeId = episode.header.episodeId;
    setLastUpload({ episodeId, status: "sending" });
    const update = (status: UploadResult["status"], message?: string) => {
      // 이전 실행의 늦은 응답이 다음 주행의 전송 상태를 덮어쓰지 않는다.
      setLastUpload(current => current?.episodeId === episodeId ? { episodeId, status, message } : current);
    };
    const task = (async () => {
      try {
        const body = JSON.stringify(collectionRecord(episode));
        if (new TextEncoder().encode(body).length > COLLECTION_BYTES) throw Error("기록이 너무 커서 전송하지 않았어요.");
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
        // 보내기 전에 삭제 권한을 보관한다. 응답 유실 때도 나중에 삭제할 수 있다.
        await updateReceipts(saved => {
          if (saved.length >= 1000) throw Error("삭제 영수증이 가득 찼어요. 서버 기록 삭제 후 다시 켜주세요.");
          return [...saved, { token, day: new Date().toISOString().slice(0, 10) }];
        });
        if (!allowed.current) { update("failed", "전송 동의가 꺼져 이번 기록은 보내지 않았어요."); return; }
        setMessage("완료한 주행 기록을 전송 중이에요.");
        const r = await fetch("/api/episodes", {
          method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body, signal: AbortSignal.timeout(20000),
        });
        if (!r.ok || (await r.json()).stored !== true) throw Error("서버 전송을 확인하지 못했어요. 자동 재시도는 하지 않으며 개인 연습은 계속할 수 있어요.");
        setMessage("주행 기록을 저장했어요. 아직 모델 학습에 반영된 것은 아니에요.");
        update("stored");
      } catch (error) {
        const message = error instanceof Error ? error.message : "전송하지 못했어요.";
        setMessage(message); update("failed", message);
      }
    })();
    pending.current.add(task);
    void task.finally(() => pending.current.delete(task));
  }, []);
  const remove = async () => {
    changeConsent(false);
    setBusy(true);
    try {
      // 진행 중 요청의 결과를 기다린 후 삭제한다. DELETE는 늦은 POST도 차단한다.
      await Promise.all([...pending.current]);
      const all = receipts();
      for (const receipt of all) {
        const r = await fetch("/api/episodes", {
          method: "DELETE", credentials: "omit", referrerPolicy: "no-referrer",
          headers: { Authorization: `Bearer ${receipt.token}` }, signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) throw Error("일부 삭제를 완료하지 못했어요. 1분 뒤 다시 눌러주세요. 미삭제 영수증은 보관했어요.");
        await updateReceipts(all => all.filter(x => x.token !== receipt.token));
      }
      setLastUpload(current => current ? { ...current, status: "deleted" } : null);
      setMessage("이 브라우저의 서버 기록을 삭제했어요. 이미 만든 학습 사본은 문의로 삭제 요청할 수 있어요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "삭제에 실패했어요."); }
    finally { setBusy(false); }
  };
  return { available, enabled: consent && available, message, busy, lastUpload, upload, changeConsent, remove };
}
