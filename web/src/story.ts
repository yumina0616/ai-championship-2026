// 표현 전용 타임라인. 센서/차량 상태나 물리 시간을 변경하지 않습니다.
export const storyChapters = [
  {
    label: "DRIVE",
    title: "Small space.",
    subtitle: "Big possibilities.",
    description: "주차가 조금, 즐거워지는 곳.",
  },
  {
    label: "SPACE",
    title: "A little space.",
    subtitle: "A different move.",
    description: "같은 차도, 공간이 달라지면 다르게 움직입니다.",
  },
  {
    label: "SENSE",
    title: "Beyond sight.",
    subtitle: "Into sense.",
    description: "눈으로 보던 공간을, 센서의 거리로.",
  },
] as const;

export function chapterAt(progress: number) {
  // 카메라 이동의 중간에서 다음 타이틀로 교체합니다.
  return Math.floor(cycle(progress) * 3 + 0.2) % 3;
}

export const FILM_SECONDS = 24;
function cycle(progress: number) {
  return Number.isFinite(progress) ? ((progress % 1) + 1) % 1 : 0;
}
type Point = [number, number, number];
// 장면당 4.8초 느린 촬영 + 3.2초 이동. 아래 드리프트가 구도 유지 중에도 이어집니다.
function curve(points: Point[], progress: number): Point {
  const step = progress * points.length;
  const index = Math.floor(step),
    t = step - index;
  const u = Math.max(0, Math.min(1, (t - 0.6) / 0.4));
  const eased = u * u * u * (10 + u * (-15 + 6 * u));
  return points[index].map(
    (v, axis) => v + (points[(index + 1) % points.length][axis] - v) * eased,
  ) as Point;
}

export function storyCamera(progress: number, narrow: boolean) {
  const p = cycle(progress);
  const positions: Point[] = narrow
    ? [
        [10.5, 7.2, 15.4],
        [8, 25, 16],
        [13, 13, 16],
      ]
    : [
        [8.2, 4.4, 10.2],
        [8, 21, 10],
        [10, 9, 12],
      ];
  const targets: Point[] = narrow
    ? [
        [.2, -2.1, 2.8],
        [0, -5, 1],
        [0, -4, 2],
      ]
    : [
        [-1.8, .5, 3.1],
        [-4, 0, 0],
        [-3, 0, 2],
      ];
  const position = curve(positions, p);
  const angle = p * Math.PI * 2;
  position[0] += 0.55 * Math.sin(angle);
  position[1] += 0.16 * Math.sin(angle * 2);
  position[2] += 0.55 * (Math.cos(angle) - 1);
  return {
    position,
    target: curve(targets, p),
  };
}
