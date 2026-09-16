import { useEffect, useRef, useState } from "react";
import { downloadJson, parseMap, type ParkingMap } from "./maps";

export default function MapShare({
  map,
  onClose,
}: {
  map: ParkingMap;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("공유 주차장");
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      className="workbench map-share"
      ref={dialog}
      onClose={() => { if (!dialog.current?.open) onClose(); }}
      aria-labelledby="map-share-title"
    >
      <h2 id="map-share-title">맵만 공유하기</h2>
      <p>
        다운로드한 파일을 원하는 사람에게 직접 전달하세요. 공유 링크 생성이나
        서버 업로드는 하지 않아요.
      </p>
      <label>
        공유 파일의 맵 이름
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
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
        사람에게 전달한 파일은 여기서 삭제하거나 회수할 수 없어요.
      </p>
      <div className="workbench-actions">
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
