import { useEffect, useState } from "react";
import { mapFromHash, type ParkingMap } from "./maps";

export default function SharedMap({
  onApply,
}: {
  onApply: (map: ParkingMap) => void;
}) {
  const [map, setMap] = useState<ParkingMap | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        setMap(mapFromHash(location.hash));
        setError("");
      } catch {
        setMap(null);
        setError(
          "공유 맵을 열 수 없어요. 링크가 손상됐거나 지원하지 않는 배치예요.",
        );
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (map || error) document.getElementById("received-map")?.scrollIntoView();
  }, [map, error]);
  function close() {
    setMap(null);
    setError("");
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#garage`,
    );
  }
  if (!map && !error) return null;
  return (
    <section
      id="received-map"
      className="workbench shared-map"
      aria-label="받은 공유 맵"
    >
      <h2>공유받은 주차장</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        map && (
          <>
            <p>
              {map.name} · 장애물 {map.obstacles.length}개 · {map.version}
            </p>
            <p>
              맵 배치와 이름만 들어 있어요. 코드 실행·자동 운전·주행 기록
              업로드는 하지 않아요. 적용하면 현재 편집 내용이 이 배치로
              바뀌어요.
            </p>
            <button
              onClick={() => {
                onApply(map);
                close();
                document.getElementById("garage")?.scrollIntoView();
              }}
            >
              확인 후 이 맵 적용
            </button>
          </>
        )
      )}
      <button onClick={close}>공유 맵 닫기</button>
    </section>
  );
}
