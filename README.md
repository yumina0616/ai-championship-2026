# Mr.Park · 미스터팍

**내 주차장을 만들고, 사람과 AI가 같은 공간에서 도전합니다.**

주차장 배치를 편집해 직접 운전하거나 학습된 마스코트 정책의 주행을 관찰하고, 같은 환경의 결과를 비교하는 참여형 3D 웹 시뮬레이터입니다.

[서비스 체험](https://mrpark.ai.kr/) · [포트폴리오](https://jinhyeong-studio.jinhyeong9568-663.workers.dev/projects/mr-park) · [제품 계획](docs/product.md)

**AI Championship 2026 · 2인 팀 프로젝트**

## 경험의 흐름

**환경 만들기 → 직접 운전 / 마스코트 운전 → 기록 재생·비교 → 환경 공유**

- 벽·기둥·옆 차량·시작점·목표를 편집하는 주차장
- P/R/D, 드래그 핸들·페달과 키보드를 이용한 직접 운전
- 실제 가상 거리 센서, 충돌·주차 판정과 센서 HUD
- 학습 정책의 운전 관찰과 동일 환경의 실행 비교
- 브라우저 최근 5회 기록, 상태 재생, 맵 링크·JSON 공유

## 화면과 엔진

| 구성 | 구현 |
| --- | --- |
| 웹·3D | React · TypeScript · Vite · React Three Fiber / Three.js |
| 엔진 | 순수 TypeScript, 렌더링과 분리된 고정 0.05초 step |
| 차량·센서 | 저속 bicycle model, 차체 충돌, ray-box 거리 계산 |
| 정책 | TensorFlow.js 행동복제 MLP, 버전 있는 학습 artifact |
| 기록 | IndexedDB · 선택적 비공개 R2 기여 저장 |

첫 인트로의 차량·센서·경로 기술 필름과 스크롤에 반응하는 3D 배경으로 제품의 구조를 보여줍니다. 인트로의 성공 주행은 **기준 제어기 기록을 활용한 연출**이며, 학습 AI의 성능 영상이 아닙니다.

## 실행

Node.js **22.12 이상**이 필요합니다.

```bash
git clone https://github.com/yumina0616/ai-championship-2026.git
cd ai-championship-2026
npm --prefix web ci
npm --prefix web run dev
```

단독 Vite 서버에서는 수집 API가 없어 사용자 기록을 업로드하지 않습니다.

<details>
<summary>직접 운전 조작</summary>

- `E`: D / `Q`: R / `P`: 주차 기어 — 정지 후 변속
- `W`: 액셀 / `S`: 브레이크
- `A·D` 또는 `←·→`: 조향 / `Space`: 일시정지
- 방향키 페달: D에서는 ↑ 액셀·↓ 브레이크, R에서는 반대
- 모바일: 드래그 핸들과 터치 페달 동시 조작

</details>

## 모델과 데이터의 한계

초기 학습 모델의 소규모 heldout 결과는 **성공 0/1**입니다. 임의 주차장 성능, 운전 실력 향상이나 실차 안전을 보장하지 않습니다. 가상 센서는 기하 계산이며 실차 센서와 동일하지 않습니다.

학습 기여는 기본 OFF입니다. 동의 후 시작한 완료 기록만 비공개 R2에 수집하며 삭제·30일 만료·일일 최대 200개 접수 제한을 적용합니다. 실제 사용자 데이터로 재학습하거나 공개 모델을 교체한 상태는 아닙니다.

[학습·평가](training/README.md) · [마스코트 추론](docs/mascot.md) · [수집 경계](docs/collection.md)

## 팀

| 팀원 | 담당 |
| --- | --- |
| **정진형 · JH-9568** | 웹 UX·3D 인터랙션, 편집·조작 UI, 기록·공유, 브라우저 통합·배포 |
| **유민아 · yumina0616** | 차량·센서·제어 엔진, 정책 학습·평가·모델 |

## 검증과 문서

```bash
npm --prefix engine ci
npm --prefix engine run typecheck
npm --prefix engine test
npm --prefix web run build
python3 scripts/check_docs.py
python3 -m unittest discover -s tests -v
```

웹 브라우저·로컬 API 검증은 [web/README.md](web/README.md)를 따릅니다.

[Architecture](docs/architecture.md) · [공통 계약](docs/contracts.md) · [비교](docs/comparison.md) · [개발 규칙](docs/development.md) · [배포](docs/cloudflare-deployment.md) · [출시 체크리스트](docs/release-checklist.md) · [기여 안내](CONTRIBUTING.md)

**라이선스는 팀 합의 전**입니다. 공개 저장소라는 이유만으로 사용 허가를 가정하지 않습니다. [외부 3D 에셋 고지](web/public/models/NOTICE.md)는 별도로 확인하세요.
