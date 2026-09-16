import { useState } from "react";

const endpoint = "/api/local-contributions";
const consentVersion = "local-synthetic.v1";
type Receipt = { id: string; token: string; expiresAt: number };

// 프로덕션 번들에서는 호출 위치 자체를 DEV 가드로 제거한다.
export default function LocalContributionTest() {
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  async function request(method: string, path = "", body?: unknown) {
    const response = await fetch(endpoint + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Parkside-Test": "1",
        ...(receipt ? { Authorization: `Bearer ${receipt.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "로컬 API 오류");
    return data;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "로컬 API를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="workbench">
      <summary>
        개발 전용 기여 테스트 <span>SYNTHETIC ONLY / LOCAL</span>
      </summary>
      <p>
        실제 내 운전 기록은 보내지 않아요. 서버가 만든 정지 5-step 합성 기록으로
        동의·개별 권한·조회·삭제만 테스트해요. 학습에는 사용하지 않아요.
      </p>
      <p>
        테스트 보관 기간은 1시간이며 만료 후 최대 1분 안에 정리돼요(서버가 켜져
        있을 때). 삭제는 이 로컬 사본에만 적용돼요. 실제 서비스 보관 정책은 별도
        결정 전까지 수집을 켜지 않아요.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const info = await request("GET");
            const ready =
              info.mode === "synthetic-only" &&
              info.consentVersion === consentVersion &&
              info.retentionSeconds === 3600;
            setEnabled(ready);
            setMessage(
              ready
                ? "로컬 합성 테스트 서버가 준비됐어요."
                : "로컬 API가 꺼져 있거나 규격이 달라요.",
            );
          })
        }
      >
        로컬 API 확인
      </button>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => setChecked(e.target.checked)}
        />
        합성 기록의 로컬 테스트 저장에 동의해요 · {consentVersion}
      </label>
      <button
        disabled={!checked || !enabled || busy || !!receipt}
        onClick={() =>
          void act(async () => {
            const data = await request("POST", "", {
              fixture: "stationary.v1",
              consent: true,
              consentVersion,
            });
            setReceipt(data);
            setChecked(false);
            setMessage(
              "합성 기록을 저장했어요. 사용자 운전 데이터는 전송하지 않았어요.",
            );
          })
        }
      >
        합성 기록 저장 테스트
      </button>
      {receipt && (
        <>
          <p>
            테스트 ID {receipt.id} · 만료{" "}
            {new Date(receipt.expiresAt).toLocaleString()}
            <br />
            삭제 권한은 이 탭의 메모리에만 있어요. 새로고침하면 잃고 만료 정리를
            기다려야 해요.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const data = await request("GET", `/${receipt.id}`);
                setMessage(
                  `내 합성 기록 ${data.episode.steps.length} step 확인 · ${data.source}`,
                );
              })
            }
          >
            내 테스트 기록 확인
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await request("DELETE", `/${receipt.id}`);
                setReceipt(null);
                setMessage(
                  "로컬 서버 합성 기록을 삭제했어요. 학습 반영은 없어요.",
                );
              })
            }
          >
            테스트 동의 철회와 삭제
          </button>
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
