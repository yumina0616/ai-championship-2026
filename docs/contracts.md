# 공통 계약 v1 초안

상태: **DRAFT — [#3](https://github.com/yumina0616/ai-championship-2026/issues/3)에서 두 사람이 실제 엔진과 fixture를 확인한 후 확정**. 아래 수치/필드명은 출발점입니다. 아직 동작하는 API나 검증된 차종 명세가 아닙니다. 확정 후 변경은 예시·테스트·생산자·소비자를 같은 PR에서 갱신합니다.

## 단위와 좌표 제안

| 대상 | 제안 |
| --- | --- |
| 단위 | 거리 m, 시간 s, 각도 rad, 속도 m/s |
| 세계 좌표 | 오른손 좌표계, 지면 x-y, 높이 +z |
| 차량 pose | 뒷차축 중심 x/y, +x 방향을 yaw=0, 반시계 양수 |
| 차량 로컬 | +x 전방, +y 왼쪽, +z 위 |
| 조향 | 앞바퀴 기준 등가 조향각, 왼쪽 양수 |
| 전후진 | signed speed 양수 전진, 음수 후진 |
| 각도 | 비교 전 [-π, π)로 정규화 |
| 웹 변환 | Three.js y-up이면 (x,y,z) → (x,z,-y), 변환은 한 곳에서만 |
| 시간 | 고정 dt 제안 0.05s. 엔진 검증 후 확정; 렌더 dt와 분리 |

pose를 차량 중심으로 해석하지 않습니다. footprint는 뒷차축 기준 뒤로 rear_overhang, 앞으로 wheelbase + front_overhang입니다. 차량 길이는 세 값의 합이어야 합니다.

## Scenario

[최소 예시](../examples/scenarios/reverse-bay.v1.json)는 synthetic fixture이며 실제 주차장/차종이나 도달 가능한 주차 경로를 보장하지 않습니다.

필수 개념: schema_version, scenario_id, units, seed, engine 설정, world bounds, vehicle spec, start pose, goal space/pose, obstacle 목록, sensor 설정, 종료/성공 평가 설정.

- scenario_id는 사람이 쓰는 식별자입니다. 같은 ID의 수정본을 구분하도록 내용 snapshot/version도 기록합니다.
- 장애물은 초기에는 지면의 회전 직사각형으로 제한합니다. 원형 기둥도 근사이면 명시합니다.
- position/heading, 길이/폭/축간거리/overhang, bounds, 센서 range와 갱신률을 검사합니다.
- 모든 숫자는 유한값이어야 하며 배열·문자열·크기 상한을 정합니다.
- 시작 footprint가 obstacle/bounds와 충돌하면 reset을 거부합니다.
- 유효한 입력이라고 주차 가능성을 보장하지 않습니다.
- 공유 맵에는 주소·실제 위치·개인 식별자를 필수로 넣지 않습니다.

## 관측과 정답의 분리

| 데이터 | policy 입력 후보 | 기록/평가 |
| --- | --- | --- |
| 차량에 붙은 거리 센서 배열 | 예 | 예 |
| 현재 속도·조향각 | 예 | 예 |
| 목표의 차량 기준 상대 x/y/yaw | 예, 자기 위치 추정 가정 명시 | 예 |
| 전체 장애물 좌표·절대 차량 pose | 초기 정책 입력 아님 | 정답 state에 저장 가능 |
| 미래 state/성공 판정/계획기 내부 경로 | 아니오 | 별도 평가·출처 정보 |

초기 목표 상대 pose는 시뮬레이터의 이상적인 자기 위치에서 계산하는 방안을 검토합니다. 사용한다면 `localization_source: simulation_ground_truth`로 공개합니다. 이 설정은 SLAM/비전 인식을 구현한 것이 아닙니다. truth 기반 기준 계획기는 허용하되 정책과 다른 정보 접근을 metadata에 표시합니다.

센서별 pose·방향·range·갱신 시각·valid flag를 포함합니다. 물체 미검출(범위 내 없음)과 센서 결측/오류를 구분합니다. 결측을 0m로 대체하지 않습니다. 정확한 표현은 fixture로 확정합니다.

## Tick와 command

순서 제안: step t의 state에서 observation_t 생성 → controller가 action_t 생성 → 범위/속도/조향 변화율 검사 → applied_command_t로 dt만큼 진행 → state_(t+1), outcome_(t+1) 기록.

action은 `target_speed_mps`, `target_steering_rad` 같은 물리값으로 맞춥니다. 모델이 정규화 출력을 사용하면 변환 기준을 model manifest에 고정합니다. 요청과 실제 적용 command를 모두 보존합니다.

메시지 공통 항목: session_id, episode_id, step_index, schema_version, message_type. 실제 HTTP 경로나 WebSocket 이벤트 이름은 [#3](https://github.com/yumina0616/ai-championship-2026/issues/3)에서 확정하며 현재 존재하는 API가 아닙니다.

- reset: 검증된 scenario를 받아 새 episode와 observation_0 반환.
- step: 해당 episode/step의 command 1개를 적용하고 다음 관측/종료 반환.
- stop: 명시적 중단; user_abort/disconnect 등을 구분.
- error: code/message/retryable과 해당 episode/step. 잘못된 입력은 조용히 clamp할지 거부할지 필드별로 정하고 기록.

서버 자유 실행이면 command 유효 기간과 비동기 sensor sample의 step 매칭을 별도로 확정합니다. 동기 step이 없는 엔진에 있다고 가정하지 않습니다.

## Episode

Header 제안: episode_id, schema_version, scenario_snapshot, scenario_version, engine_version, vehicle/sensor/evaluator version, seed, controller_kind, policy_version 또는 null, 시작 시각, consent 상태/버전, view_mode, assistance flags.

Step 제안: step_index, sim_time_s, observation_t, requested_action_t, applied_command_t, next_state_truth, next_outcome, wall_timestamp. truth는 정책 학습 입력 생성 단계에서 명시적으로 제거합니다.

Footer: 종료 사유, 총 simulation time, 이동 거리, 방향 전환 수, 충돌 유무, 최종 위치·각도 오차, success, 기록 완전성.

controller_kind 후보: human / planner / learned / mock. 기록 playback은 새 제어자 학습 실행이 아니므로 원본 controller와 playback 모드를 함께 표시합니다. learned는 실제 artifact와 policy_version이 있어야 합니다.

로그가 중간에 끊기면 incomplete로 남깁니다. 실행 횟수를 성공 사례만으로 집계하지 않습니다. 상호 비교는 scenario snapshot·vehicle·초기조건·evaluator 버전이 같은 경우에만 수행합니다.

## 성공/종료

성공은 목표 공간에 차체가 포함되고, 목표 pose 오차·정지 속도·유지 시간의 기준을 충족한 경우로 정의할 것을 제안합니다. 위치/각도/속도 임계와 예산은 [#9](https://github.com/yumina0616/ai-championship-2026/issues/9)에서 테스트로 확정합니다.

충돌·timeout·user_abort·disconnect·engine_error·policy_error·success를 구분합니다. 같은 tick에 충돌과 성공 조건이 발생하면 충돌을 우선하도록 제안합니다. 다른 순서는 계약에서 명시합니다.

## 확정 체크리스트

- [ ] 기존 엔진에서 좌표/기준점/단위/부호 실측.
- [ ] 같은 입력을 두 구현 경계에서 읽는 fixture 준비.
- [ ] step 적용 시점과 센서 정렬, 종료 우선순위 확정.
- [ ] 정책 입력과 truth 접근 범위 확정.
- [ ] 정상/비정상/누락/중복/세션 reset 예시 검사.
- [ ] schema 버전과 변경 영향, 두 사람 리뷰 기록.
