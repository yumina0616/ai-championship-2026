// 화면 선택지와 배포 리소스 확인. 실제 차량/센서 계산은 driving.ts → engine/이 담당합니다.
export type Mode = "human" | "mascot";
import type { TemplateId } from "./scenario";
export type { TemplateId } from "./scenario";
export type PreviewState = "idle" | "loading" | "ready" | "error" | "finished";

export const templates: {
  id: TemplateId;
  title: string;
  description: string;
  tag: string;
}[] = [
  {
    id: "open",
    title: "여유로운 첫 주차",
    description: "넓은 공간에서 천천히 시작해요",
    tag: "첫 연습 추천",
  },
  {
    id: "neighbors",
    title: "옆 차 사이로 쏙",
    description: "양옆 차량과의 간격을 살펴봐요",
    tag: "간격 감각",
  },
  {
    id: "pillar",
    title: "기둥 옆 한 자리",
    description: "시야를 가리는 기둥을 확인해요",
    tag: "공간 감각",
  },
];

export async function loadPreview(signal: AbortSignal): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const response = await fetch(base + "runtime.json", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("미리보기를 불러오지 못했어요.");
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("kind" in data) ||
    data.kind !== "browser-engine" ||
    !("version" in data) ||
    data.version !== 1
  ) {
    throw new Error("미리보기 형식을 확인할 수 없어요.");
  }
}
