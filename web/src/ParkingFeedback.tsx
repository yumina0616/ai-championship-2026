import { Check, Minus } from "lucide-react";
import type { ParkingStatus, SuccessCriteria } from "../../engine/src/index";

export function parkingMessage(status: ParkingStatus) {
  if (status.collision) return "장애물 또는 경계에 닿았어요";
  if (!status.inside) return "차체 전체를 표시된 칸 안으로";
  if (!status.angleOk) return "차량 방향과 각도를 맞춰주세요";
  if (!status.positionOk) return "목표 중앙에 조금 더 가까이";
  if (!status.stopped) return "브레이크를 밟아 멈춰주세요";
  return "정지 확인 중 · 그대로 유지하세요";
}

export default function ParkingFeedback({
  status,
  criteria,
}: {
  status: ParkingStatus;
  criteria: SuccessCriteria;
}) {
  const checks = [
    ["차체", status.inside],
    ["위치", status.positionOk],
    ["각도", status.angleOk],
    ["정지", status.stopped],
  ] as const;
  return (
    <aside
      className="parking-feedback"
      aria-label="주차 성공 조건"
      data-ready={status.ready}
    >
      <span className="parking-kicker">PARKING CHECK</span>
      <strong aria-live="polite">{parkingMessage(status)}</strong>
      <div className="parking-checks">
        {checks.map(([label, ok]) => (
          <span key={label} data-ok={ok}>
            {ok ? <Check size={12} /> : <Minus size={12} />}
            {label}
            <span className="sr-only">{ok ? " 충족" : " 미충족"}</span>
          </span>
        ))}
      </div>
      <p>
        위치 {status.positionErrorM.toFixed(2)} /{" "}
        {criteria.positionToleranceM.toFixed(2)} m
        <br />
        각도 {((status.yawErrorRad * 180) / Math.PI).toFixed(1)} /{" "}
        {((criteria.yawToleranceRad * 180) / Math.PI).toFixed(1)}°
      </p>
      {status.ready ? (
        <>
          <progress
            aria-label="정지 유지 시간"
            value={status.heldForS}
            max={status.requiredHoldS || 1}
          />
          <small>
            {status.heldForS.toFixed(1)} / {status.requiredHoldS.toFixed(1)}초
          </small>
        </>
      ) : (
        <small>
          화살표는 차량 앞쪽 · 칸 안에서 {criteria.holdTimeS}초 정지
        </small>
      )}
    </aside>
  );
}
