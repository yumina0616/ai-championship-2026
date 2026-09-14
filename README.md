# AI Championship 2026 — 참여형 주차 시뮬레이터

내 상황과 비슷한 주차장을 만들고 직접 연습하거나, 같은 공간에서 AI 마스코트가 주차하는 모습을 살펴보는 웹 서비스입니다.

사용자의 선택적 데이터 기여를 바탕으로 정책을 학습하고, 별도 평가를 통과한 버전만 공개하는 참여형 Physical AI 실험을 목표로 합니다. 서비스명과 마스코트 이름은 아직 정하지 않았습니다.

> 현재 상태: 기획·공통 계약 초안·협업 규칙·GitHub Issue·문서 검증 기반을 준비한 단계입니다. 웹 서비스, 차량 엔진 연결, 센서, 학습 정책은 아직 이 저장소에 구현되지 않았습니다. 실행 가능한 앱이나 성능 결과가 있는 것처럼 해석하지 마세요.

## 왜 만드는가

주차할 장소의 폭·기둥·옆 차량과 내 차량 크기가 달라지면 같은 주차 요령도 적용하기 어렵습니다. 우리는 위험 없이 배치를 바꿔 반복해보는 개인 연습 경험과, 같은 조건에서 학습 정책의 행동·실패를 확인하는 경험을 연결하려 합니다.

이는 검증할 제품 가설입니다. 실제 운전 능력 향상이나 실차 자율주행 적용 가능성이 입증된 것은 아닙니다. 상세한 사용자·문제·검증 기준은 [제품 계획](docs/product.md)을 읽어주세요.

## 목표 경험

1. 주차장 템플릿을 고르고 벽·기둥·옆 차량·시작점·목표를 편집합니다.
2. 지원 차량의 제원을 확인합니다. 첫 버전은 검증된 차량 1종부터 시작합니다.
3. **직접 운전** 또는 **마스코트 운전**을 선택합니다. 두 모드는 같은 환경과 차량 엔진을 사용합니다.
4. 센서·궤적·주차 결과를 확인하고 기록을 재생하거나 환경을 공유합니다.
5. 원하는 사용자만 주행 기록을 학습에 기여합니다. 수집량과 정책 성능은 별개로 공개합니다.

마스코트는 실제로 학습한 제어 정책을 표현하는 캐릭터입니다. 계획기·수동 조작·모의 데이터·녹화 재생은 각각 별도로 표시하며 학습된 AI로 포장하지 않습니다.

## MVP와 후속 범위

| 제출 MVP 목표 | 제출 후 확장 |
| --- | --- |
| 직각 후진주차 템플릿, 자유로운 장애물 편집 | 평행주차·다차종·더 다양한 환경 |
| 저속 차량 제어, 차체 충돌, 실제 가상 거리 센서 | 센서 노이즈 다양화·카메라 비전 |
| 직접 운전과 실제 학습 정책의 선택형 운전 | 되감기·선택형 코치 |
| 실행 기록·공통 지표·환경 공유·동의 기반 기여 | 참여 데이터 재학습·정책 승격·성장 공개 |
| 학습에 쓰지 않은 환경 평가, 공개 서비스 | 별도 시뮬레이터 검증과 제한된 실물 실험 |

지도·사진에서 실제 주차장을 자동 복원하는 기능은 MVP가 아닙니다. 자유 배치가 가능해도 모든 배치에서 주차 가능한 것은 아닙니다.

## 기술 방향과 미확정 사항

- 웹: React + TypeScript, 3D 표현은 React Three Fiber/Three.js를 우선 검토합니다. 설치 버전과 구체 프레임워크는 [#4](https://github.com/yumina0616/ai-championship-2026/issues/4)에서 확정합니다.
- 엔진: 팀원의 기존 ROS·시뮬레이터·제어 코드를 먼저 검증합니다. 특정 시뮬레이터를 이미 선택한 상태가 아닙니다.
- 실행: 기존 엔진의 서버 실행 또는 핵심 기능의 웹 실행 중 [#2](https://github.com/yumina0616/ai-championship-2026/issues/2)에서 하나를 선택합니다. 웹 화면만 두고 서버에서 엔진을 실행하는 방식도 가능합니다.
- 학습: 기존 학습 코드 재사용 또는 작은 행동복제 기준 모델부터 검증합니다. 모델 종류·프레임워크는 아직 미확정입니다.
- 저장·배포: 초기 공개 preview는 [#4](https://github.com/yumina0616/ai-championship-2026/issues/4), 실제 엔진 운영은 [#2](https://github.com/yumina0616/ai-championship-2026/issues/2), 기여 데이터 저장소는 [#13](https://github.com/yumina0616/ai-championship-2026/issues/13)에서 선택합니다.
- 현재 개발 의존성: 문서 검사에 Python 3.11 이상 표준 라이브러리만 사용합니다. 앱 의존성은 아직 추가하지 않았습니다.

모듈 책임과 실행 선택지는 [아키텍처](docs/architecture.md), 입력·출력 초안은 [공통 계약](docs/contracts.md)에 있습니다.

## 지금 개발을 시작하려면

```bash
git clone https://github.com/yumina0616/ai-championship-2026.git
cd ai-championship-2026
python3 scripts/check_docs.py
python3 -m unittest discover -s tests -v
```

위 명령은 문서 기반만 검증합니다. 앱 실행 명령은 웹/엔진 구현 PR에서 추가합니다.

| 담당 | 지금 할 일 | 다음 연결 |
| --- | --- | --- |
| JH-9568 | [#4](https://github.com/yumina0616/ai-championship-2026/issues/4) 웹 기본 화면·초기 preview | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) 계약 공동 검토 → [#6](https://github.com/yumina0616/ai-championship-2026/issues/6) 편집기 |
| yumina0616 | [#2](https://github.com/yumina0616/ai-championship-2026/issues/2) 기존 코드·센서·웹 왕복 검증 | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) 계약 확정 → [#5](https://github.com/yumina0616/ai-championship-2026/issues/5) 차량 → [#7](https://github.com/yumina0616/ai-championship-2026/issues/7) 센서 |

전체 할당·의존 관계는 [개발 계획](docs/mvp-plan.md), 실시간 상태는 [Issues](https://github.com/yumina0616/ai-championship-2026/issues), 제출 범위는 [마일스톤](https://github.com/yumina0616/ai-championship-2026/milestone/1)에서 확인합니다.

## 문서 안내

| 문서 | 읽는 목적 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 개발자·에이전트의 작업 시작점 |
| [제품 계획](docs/product.md) | 문제·사용 흐름·성공 기준·범위 |
| [개발 계획](docs/mvp-plan.md) | 역할·일정·Issue 의존 관계 |
| [재사용 검증](docs/integration-spike.md) | 기존 시뮬레이터 정보와 선택 근거 |
| [아키텍처](docs/architecture.md) | 웹·엔진·정책·기록 책임 경계 |
| [공통 계약](docs/contracts.md) | 좌표·제어·센서·Episode 초안 |
| [데이터와 학습](docs/data-learning.md) | 동의·학습 누출·평가·정책 성장 |
| [개발 규칙](docs/development.md) | Issue·브랜치·한국어 커밋·PR·리뷰 |
| [제출 체크리스트](docs/release-checklist.md) | 실제 동작·권리·운영·제출 검증 |
| [Contributing](CONTRIBUTING.md) | 기여 방법 |

## 원칙과 한계

가상 센서는 실제 기하 계산을 사용하되 실제 센서와 동일하다고 주장하지 않습니다. 화면의 정답 좌표와 모델 입력은 분리합니다. 이상적인 시뮬레이션 자기 위치를 쓰면 그 사실을 공개합니다.

사용자 수가 증가해도 성능이 자동 향상되는 것은 아닙니다. 데이터 정제·재학습·분리된 평가를 거쳐야 합니다. 모델의 행동은 시뮬레이션 실험이며 실제 차량 제어·안전 지침으로 사용하지 않습니다.

## 라이선스·권리

이 저장소의 라이선스는 팀원 합의 전입니다. 다른 프로젝트의 라이선스를 그대로 적용하지 않습니다. [#2](https://github.com/yumina0616/ai-championship-2026/issues/2)에서 재사용 코드·모델·에셋의 권리와 공개 범위를 확인한 뒤 적절한 LICENSE와 고지를 추가합니다. 현재 오픈소스 사용 허가가 부여되었다고 가정하지 마세요.
