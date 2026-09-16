import { useEffect, useRef, useState } from "react";
import { downloadJson, mapLink, parseMap, type ParkingMap } from "./maps";

export default function MapShare({
  map,
  onClose,
}: {
  map: ParkingMap;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("공유 주차장");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    const navigate = () => node.close();
    window.addEventListener("hashchange", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
      node.close();
    };
  }, []);
  return (
    <dialog
      className="workbench map-share"
      ref={dialog}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
      aria-labelledby="map-share-title"
    >
      <h2 id="map-share-title">맵만 공유하기</h2>
      <p>
        파일이나 맵만 담은 링크를 직접 전달하세요. 운전 기록을 서버에 업로드하지
        않아요. 링크는 암호화되지 않으며 받은 사람 누구나 볼 수 있어요.
      </p>
      <label>
        공유 파일의 맵 이름
        <input
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setLink("");
          }}
        />
      </label>
      <p>
        주소·차량번호·개인정보를 이름에 넣지 마세요. 원래 이름 대신 공유용
        이름을 사용하며, 편집 중인 맵 이름은 바뀌지 않아요.
      </p>
      <dl>
        <dt>포함</dt>
        <dd>
          시작 위치·목표 칸·장애물 {map.obstacles.length}개·공유용 이름·맵 버전
        </dd>
        <dt>포함하지 않음</dt>
        <dd>운전 기록·센서 로그·시각·사용자 식별자·학습 동의</dd>
      </dl>
      <p>
        받은 파일은 나만의 주차장 만들기 → 맵 파일 열기로 복원할 수 있어요. 다른
        사람에게 전달한 파일·링크는 여기서 삭제하거나 회수할 수 없어요.
      </p>
      {link && (
        <label>
          공유 링크
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <p role="status">{message}</p>
      <div className="workbench-actions">
        <button
          disabled={!name.trim()}
          onClick={() => {
            try {
              setLink(mapLink({ ...map, name }, location.href));
              setMessage(
                location.hostname === "127.0.0.1" ||
                  location.hostname === "localhost"
                  ? "로컬 주소예요. 지금은 같은 PC에서만 열 수 있고 외부 공유는 공개 배포 후 가능해요."
                  : "링크를 복사해 전달하세요. 서비스 접속 주소가 유지되어야 해요.",
              );
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "링크 생성에 실패했어요.",
              );
            }
          }}
        >
          확인 후 링크 만들기
        </button>
        <button
          disabled={!name.trim()}
          onClick={() => {
            downloadJson(
              parseMap(JSON.stringify({ ...map, name })),
              "parkside-map.json",
            );
            onClose();
          }}
        >
          확인 후 맵 다운로드
        </button>
        <button onClick={onClose}>취소</button>
      </div>
    </dialog>
  );
}
