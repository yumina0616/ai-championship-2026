# 역할·Issue·제출 개발 계획

기준일: 2026-09-15. 실제 진행 상태는 GitHub Issue와 PR이 기준입니다. 이 문서는 담당/의존 관계/목표 일정을 설명하며 아직 완료되지 않은 기능을 완료로 표시하지 않습니다.

## 9/16 배포 전 통합 작업

기반 엔진·센서·기준 제어·학습 모델(#11/PR #31), 편집·로컬 기록·웹 안정화가 main에 통합되었습니다. #4/#8의 남은 공개 환경 확인은 #15로 이관해 중복 추적을 정리했습니다.

이번 작업 브랜치는 #12 모델 실행 → 그 로컬 계약을 사용하는 #14 비교를 순서대로 연결하고 함께 검증합니다. 의존 코드가 main에 이미 있다고 가장하지 않고 같은 통합 변경으로 리뷰합니다. #13은 맵 포함 URL과 로컬 합성 API까지만 검증하며 실제 사용자 수집은 꺼 둡니다. 실제 서버/보관 정책/운영·공개 배포는 별도 승인 후 진행합니다. #16–#18은 후속 범위이며 이번 배포 전 작업에 포함하지 않습니다.

## 역할

| 사람 | 주 책임 | 상대가 검토할 경계 |
| --- | --- | --- |
| JH-9568 | 웹 UX, 편집기, 조작 UI, 기록·공유, 배포, 제출 통합 | 시뮬레이터 입출력·모델 실행 연결 |
| yumina0616 | 기존 코드 검증, 차량·센서·제어, 학습·평가·모델 | 웹 왕복·공통 계약·평가 결과 표시 |
| 공동 | 계약 변경, MVP 범위 변경, 통합 검증 | 각자 PR은 상대가 리뷰 |

동시에 여러 코드 작업을 벌이기보다 각자 주 작업 1개 + 상대 PR 리뷰를 기본으로 합니다. 막히면 대기 사실만 적지 말고 필요한 계약/로그/결정을 Issue에 남깁니다.

## 일정과 제출 기준

참가 접수 9월 18일 23:59:59, 과제 제출 9월 20일 23:59:59입니다. 예선 심사·투표는 9월 21일–10월 5일, 데모데이는 10월 17일입니다. 운영은 10월 17일까지 공개 접속 유지로 계획합니다. 일정·필수 제출물은 [공식 안내](https://static.wanted.co.kr/ai-championship/2026/landing.html)를 2026-09-15 확인했습니다. 변경 공지를 제출 전에 다시 확인합니다.

| 날짜 | JH-9568 목표 | yumina0616 목표 | 통합 확인 |
| --- | --- | --- | --- |
| 9/15 | [#4](https://github.com/yumina0616/ai-championship-2026/issues/4) 화면·preview 착수 | [#2](https://github.com/yumina0616/ai-championship-2026/issues/2) 기존 코드/웹 왕복 | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) 초안 검토, 엔진 선택 |
| 9/16 | [#6](https://github.com/yumina0616/ai-championship-2026/issues/6) 맵 편집 | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) 확정 → [#5](https://github.com/yumina0616/ai-championship-2026/issues/5) 차량 | 같은 fixture reset/command |
| 9/17 | [#8](https://github.com/yumina0616/ai-championship-2026/issues/8) 수동 연결 → [#10](https://github.com/yumina0616/ai-championship-2026/issues/10) 기록 | [#7](https://github.com/yumina0616/ai-championship-2026/issues/7) 센서 → [#9](https://github.com/yumina0616/ai-championship-2026/issues/9) 기준 제어·평가 | 직접 운전 1개 장면 완주 |
| 9/18 | [#13](https://github.com/yumina0616/ai-championship-2026/issues/13) 공유·동의 | [#11](https://github.com/yumina0616/ai-championship-2026/issues/11) 학습·heldout 평가 | 참가 접수·팀원 등록 확인 |
| 9/19 | [#12](https://github.com/yumina0616/ai-championship-2026/issues/12) 마스코트 → [#14](https://github.com/yumina0616/ai-championship-2026/issues/14) 비교 | 추론 연결·실패 원인·평가 보고 | 실제 모델까지 통합 |
| 9/20 | [#15](https://github.com/yumina0616/ai-championship-2026/issues/15) 공개 검증·제출 | [#15](https://github.com/yumina0616/ai-championship-2026/issues/15) 모델/센서/결과 교차 검증 | 기능 freeze, 자료·운영 확인 |

이 일정은 예상이며 보장하지 않습니다. 기존 코드 재사용 결과에 따라 9/15~16에 재계획합니다. 개발 시작이 늦어지면 날짜를 그대로 밀어 제출 마감을 넘기지 말고 기능 범위를 명시적으로 줄입니다.

## Issue 목록과 의존 관계

P0는 제출 목표, P1은 후속입니다. 아래 선행 작업이 해결되면 담당자가 `status:blocked`를 제거합니다. 문서/화면 스케치는 미리 가능하지만 계약이 필요한 실제 연결은 선행 PR 병합 후 진행합니다.

| Issue | 주 담당 | 선행 | 우선순위 |
| --- | --- | --- | --- |
| [#1](https://github.com/yumina0616/ai-championship-2026/issues/1) 한국어 기획·협업 문서와 저장소 검증 CI 구성 | JH-9568 | 없음 | P0 |
| [#2](https://github.com/yumina0616/ai-championship-2026/issues/2) 기존 ROS·시뮬레이터 재사용과 웹 연결 검증 | yumina0616 | 없음 | P0 |
| [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) 환경·차량·센서·제어·Episode v1 계약 확정 | yumina0616 (공동) | [#2](https://github.com/yumina0616/ai-championship-2026/issues/2) | P0 |
| [#4](https://github.com/yumina0616/ai-championship-2026/issues/4) 기본 화면·연결 상태와 초기 미리보기 배포 | JH-9568 | [#1](https://github.com/yumina0616/ai-championship-2026/issues/1) | P0 |
| [#5](https://github.com/yumina0616/ai-championship-2026/issues/5) 저속 차량 제어·고정 시간 스텝·충돌 구현 | yumina0616 | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) | P0 |
| [#6](https://github.com/yumina0616/ai-championship-2026/issues/6) 주차장 템플릿·장애물 배치·시작 및 목표 편집 | JH-9568 | [#3](https://github.com/yumina0616/ai-championship-2026/issues/3), [#4](https://github.com/yumina0616/ai-championship-2026/issues/4) | P0 |
| [#7](https://github.com/yumina0616/ai-championship-2026/issues/7) 거리 센서와 정책 관측값 실제 계산 | yumina0616 | [#5](https://github.com/yumina0616/ai-championship-2026/issues/5) | P0 |
| [#8](https://github.com/yumina0616/ai-championship-2026/issues/8) 직접 운전·센서 표시·실패 및 재시작 | JH-9568 | [#5](https://github.com/yumina0616/ai-championship-2026/issues/5), [#6](https://github.com/yumina0616/ai-championship-2026/issues/6), [#7](https://github.com/yumina0616/ai-championship-2026/issues/7) | P0 |
| [#9](https://github.com/yumina0616/ai-championship-2026/issues/9) 기준 주차 제어기와 성공 판정·학습용 rollout | yumina0616 | [#5](https://github.com/yumina0616/ai-championship-2026/issues/5), [#7](https://github.com/yumina0616/ai-championship-2026/issues/7) | P0 |
| [#10](https://github.com/yumina0616/ai-championship-2026/issues/10) Episode 수집·검증·상태 재생과 파일 내보내기 | JH-9568 | [#8](https://github.com/yumina0616/ai-championship-2026/issues/8), [#3](https://github.com/yumina0616/ai-championship-2026/issues/3) | P0 |
| [#11](https://github.com/yumina0616/ai-championship-2026/issues/11) 초기 주차 정책 학습·미관측 환경 평가·모델 배포 | yumina0616 | [#9](https://github.com/yumina0616/ai-championship-2026/issues/9) | P0 |
| [#12](https://github.com/yumina0616/ai-championship-2026/issues/12) 마스코트 자율 주차 모드·모델 버전과 상태 표시 | JH-9568 | [#8](https://github.com/yumina0616/ai-championship-2026/issues/8), [#11](https://github.com/yumina0616/ai-championship-2026/issues/11) | P0 |
| [#13](https://github.com/yumina0616/ai-championship-2026/issues/13) 환경 공유와 선택적 학습 기여 동의 | JH-9568 | [#6](https://github.com/yumina0616/ai-championship-2026/issues/6), [#10](https://github.com/yumina0616/ai-championship-2026/issues/10) | P0 |
| [#14](https://github.com/yumina0616/ai-championship-2026/issues/14) 같은 환경의 사람·정책 실행 비교 화면 | JH-9568 | [#10](https://github.com/yumina0616/ai-championship-2026/issues/10), [#9](https://github.com/yumina0616/ai-championship-2026/issues/9), [#12](https://github.com/yumina0616/ai-championship-2026/issues/12) | P0 |
| [#15](https://github.com/yumina0616/ai-championship-2026/issues/15) 공개 배포·통합 검증·실측 결과와 제출자료 확정 | JH-9568 (공동) | [#14](https://github.com/yumina0616/ai-championship-2026/issues/14), [#13](https://github.com/yumina0616/ai-championship-2026/issues/13) | P0 |
| [#16](https://github.com/yumina0616/ai-championship-2026/issues/16) 되감기와 실패 지점 분기 재시도 | JH-9568 | [#10](https://github.com/yumina0616/ai-championship-2026/issues/10) | P1 |
| [#17](https://github.com/yumina0616/ai-championship-2026/issues/17) 참여 데이터 큐레이션과 마스코트 정책 개선 검증 | yumina0616 | [#11](https://github.com/yumina0616/ai-championship-2026/issues/11), [#13](https://github.com/yumina0616/ai-championship-2026/issues/13) | P1 |
| [#18](https://github.com/yumina0616/ai-championship-2026/issues/18) 실제 실행 근거를 사용하는 선택형 주차 코치 | JH-9568 | [#14](https://github.com/yumina0616/ai-championship-2026/issues/14) | P1 |

## 내일 바로 시작할 순서

- JH-9568: [#4](https://github.com/yumina0616/ai-championship-2026/issues/4)에서 화면 흐름과 preview를 만듭니다. 모의 데이터에 MOCK 표시를 붙이고 아직 확정되지 않은 물리 엔진을 따로 구현하지 않습니다.
- yumina0616: [#2](https://github.com/yumina0616/ai-championship-2026/issues/2)에서 [재사용 검증 양식](integration-spike.md)을 채우고 실제 센서 수신까지 보여줍니다.
- 공동: 위 결과를 바탕으로 [#3](https://github.com/yumina0616/ai-championship-2026/issues/3)에서 좌표·시간·입출력·기록 fixture를 확정합니다.

기록 기능을 먼저 기다려 학습이 막히지 않도록 [#9](https://github.com/yumina0616/ai-championship-2026/issues/9)에서 공통 Episode 계약에 맞는 기준 rollout을 직접 생성합니다. 사용자 업로드는 초기 학습의 선행 조건이 아닙니다.

## Scope freeze와 실패 대응

1. 지킬 핵심: 직접 운전, 실제 가상 센서, 같은 환경의 실제 학습 정책, 실행 기록과 정직한 결과.
2. 먼저 줄일 것: 장식, 템플릿 수, 다차종, 코치, 되감기, 커뮤니티 화면.
3. 서버/저장소 준비가 안 되면 학습 업로드를 끄고 로컬 기록을 유지합니다. 공유·기여가 미완성이라는 사실을 README/제출 자료에 반영하고 Issue를 닫지 않습니다.
4. 학습 정책이 동작하지 않으면 계획기를 학습 AI로 대체 표기하지 않습니다. 미완료를 공개하고 실제 제출 가능 범위를 공동 판단합니다.
5. 변경 결정은 관련 Issue에 이유·남는 범위·제출 설명의 변경을 남기고 이 문서를 갱신합니다.

매일 종료 전에 각자 Issue에 완료/다음/막힌 점과 PR 링크를 짧게 남깁니다. 새 계약 결정을 채팅에만 보관하지 않습니다.
