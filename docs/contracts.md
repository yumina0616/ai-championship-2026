# 공통 계약 v1

상태: **[#3](https://github.com/yumina0616/ai-championship-2026/issues/3)에서 1차 확정**. 실행 엔진은 [#2](https://github.com/yumina0616/ai-championship-2026/issues/2) 결론에 따라 **브라우저 TypeScript 직접 구현**으로 확정됐다(`docs/integration-spike.md` 참고). 아래 좌표·부호·dt 규칙은 그 spike에서 실측 검증을 마쳤다. 다만 구체 차종 제원(길이·축간거리 등)은 여전히 개발 fixture 수치이며 실제 차종 명세는 아니다. 확정 후 변경은 예시·테스트·생산자·소비자를 같은 PR에서 갱신한다.

## 단위와 좌표 (확정)

| 대상 | 규칙 | 검증 |
| --- | --- | --- |
| 단위 | 거리 m, 시간 s, 각도 rad, 속도 m/s | - |
| 세계 좌표 | 오른손 좌표계, 지면 x-y, 높이 +z | - |
| 차량 pose | 뒷차축 중심 x/y, +x 방향을 yaw=0, 반시계 양수 | `docs/integration-spike.md` spike에서 직진 시 y/yaw 불변 확인 |
| 차량 로컬 | +x 전방, +y 왼쪽, +z 위 | - |
| 조향 | 앞바퀴 기준 등가 조향각, 왼쪽 양수 | spike에서 steer=+0.3rad 시 y/yaw 양수로 증가 확인 (왼쪽 양수) |
| 전후진 | signed speed 양수 전진, 음수 후진 | spike에서 speed=-0.5 시 진행거리 감소, yaw 불변 확인 |
| 각도 | 비교 전 [-π, π)로 정규화 | - |
| 웹 변환 | Three.js y-up이면 (x,y,z) → (x,z,-y), 변환은 한 곳에서만 | 엔진이 브라우저 내부이므로 변환 지점은 렌더러 바로 앞 단일 adapter 함수로 고정한다 |
| 시간 | 고정 dt = **0.05s 확정**. 렌더 dt(`requestAnimationFrame`)와 분리된 accumulator로 누적 적용 | spike에서 dt×step 누적이 기대 이동거리와 일치 확인(예: 0.8m/s×2s=1.6m) |

pose를 차량 중심으로 해석하지 않는다. footprint는 뒷차축 기준 뒤로 `rear_overhang_m`, 앞으로 `wheelbase_m + front_overhang_m`이다. 차량 길이는 세 값의 합이다. 개발 기준값(`examples/scenarios/reverse-bay.v1.json`): `wheelbase_m=2.6, front_overhang_m=0.9, rear_overhang_m=0.9` (length 4.4m) — 실제 지원 차종이 정해지면 이 값을 교체하되 계산 방식은 그대로 유지한다.

## Scenario

[최소 예시](../examples/scenarios/reverse-bay.v1.json)는 synthetic fixture이며 실제 주차장/차종이나 도달 가능한 주차 경로를 보장하지 않는다. `engine.kind`는 `browser-kinematic-ts.v1`로 갱신했다(#2 결정 반영, `pending-spike`였던 이전 값 대체).

필수 개념: schema_version, scenario_id, units, seed, engine 설정, world bounds, vehicle spec, start pose, goal space/pose, obstacle 목록, sensor 설정, 종료/성공 평가 설정.

- scenario_id는 사람이 쓰는 식별자다. 같은 ID의 수정본을 구분하도록 내용 snapshot/version도 기록한다.
- 장애물은 초기에는 지면의 회전 직사각형으로 제한한다. 원형 기둥도 근사이면 명시한다.
- position/heading, 길이/폭/축간거리/overhang, bounds, 센서 range와 갱신률을 검사한다.
- 모든 숫자는 유한값이어야 하며(`NaN`/`Infinity` 거부) 배열·문자열·크기 상한을 정한다.
- **시작 footprint가 obstacle/bounds와 충돌하면 `reset()`은 값을 반환하지 않고 에러를 던진다**(아래 에러 절 참고). [잘못된 예시](../examples/scenarios/invalid-overlap-start.v1.json) 참고.
- 유효한 입력이라고 주차 가능성을 보장하지 않는다.
- 공유 맵에는 주소·실제 위치·개인 식별자를 필수로 넣지 않는다.

## 관측과 정답의 분리

| 데이터 | policy 입력 후보 | 기록/평가 |
| --- | --- | --- |
| 차량에 붙은 거리 센서 배열 | 예 | 예 |
| 현재 속도·조향각 | 예 | 예 |
| 목표의 차량 기준 상대 x/y/yaw | 예, 자기 위치 추정 가정 명시 | 예 |
| 전체 장애물 좌표·절대 차량 pose | 초기 정책 입력 아님 | 정답 state에 저장 가능 |
| 미래 state/성공 판정/계획기 내부 경로 | 아니오 | 별도 평가·출처 정보 |

초기 목표 상대 pose는 시뮬레이터(= 브라우저 엔진)의 이상적인 자기 위치에서 계산한다. `localization_source: simulation_ground_truth`로 공개한다(`examples/scenarios/reverse-bay.v1.json`에 이미 반영됨). 이 설정은 SLAM/비전 인식을 구현한 것이 아니다. truth 기반 기준 계획기는 허용하되 정책과 다른 정보 접근을 metadata에 표시한다.

센서별 pose·방향·range·갱신 시각·valid flag를 포함한다. 물체 미검출(범위 내 없음)과 센서 결측/오류를 구분한다. 결측을 0m로 대체하지 않는다 — 미검출은 `range: max_range_m, valid: true`, 결측/오류는 `range: null, valid: false`로 구분한다(아래 observation 타입 참고).

## 엔진 인터페이스 (확정 — HTTP/WebSocket 아님)

[#2](https://github.com/yumina0616/ai-championship-2026/issues/2) 결정에 따라 엔진은 같은 브라우저 탭 안에서 동작하는 TypeScript 모듈이다. "메시지"가 아니라 **함수 호출**이며, 네트워크 왕복·세션 ID·재전송 문제가 사라진다. 최소 인터페이스 제안:

```ts
interface ParkingEngine {
  reset(scenario: Scenario, seed?: number): Observation;       // 실패 시 throw EngineError
  step(command: Command): { observation: Observation; outcome: Outcome };
  // step은 동기 함수. 호출자가 dt(0.05s)마다 1회씩만 호출해야 한다.
}

interface Command {
  target_speed_mps: number;
  target_steering_rad: number;
}

interface EngineError {
  code: "invalid_scenario" | "start_overlap" | "out_of_range" | "not_finite";
  message: string;
  retryable: false; // 엔진 내부 호출이라 재시도 개념이 없음 — 호출자가 입력을 고쳐서 다시 reset/step
}
```

- **reset**: 검증된 scenario를 받아 새 episode(새 `episode_id`)와 `observation_0`을 반환한다. 검증 실패(겹친 시작점, NaN, 범위 밖 치수)는 값을 반환하지 않고 `EngineError`를 던진다. [잘못된 예시](../examples/scenarios/invalid-overlap-start.v1.json)는 `start_overlap`으로 거부되어야 한다.
- **step**: 호출 시점의 command 1개를 적용하고 다음 observation/outcome을 반환한다. 요청과 실제 적용 command를 모두 보존한다(`requested_action` vs `applied_command`, 아래 Episode 참고).
- **범위 밖 입력**: `target_speed_mps`/`target_steering_rad`가 vehicle spec의 한계를 넘으면 **clamp해서 적용**하고 `applied_command`에 clamp된 값을 기록한다(거부하지 않음 — 사람 입력 장치의 작은 오버슈트까지 매번 막으면 조작감이 나빠짐). `NaN`/`Infinity` command는 clamp 대상이 아니라 **거부**하고 `EngineError(code: "not_finite")`를 던진다.
- **중복/지연 호출**: 브라우저 단일 스레드 동기 호출이라 네트워크 중복/지연은 발생하지 않는다. 같은 `step()`을 연속 두 번 부르면 매번 dt만큼 진행된 별개의 step으로 취급한다(중복 아님) — 호출 빈도를 맞추는 책임은 호출자(렌더 루프)에 있다.
- **reset 이전 command 거부**: `reset()` 호출 전에는 `step()` 호출 자체가 불가능하도록 타입으로 강제한다(엔진 인스턴스가 `reset` 전에는 `step`을 노출하지 않는 상태기계로 구현).
- **"연결 끊김"의 대응 개념**: 탭을 닫거나 새로고침하면 엔진 인스턴스가 사라진다 — 서버에 연결 유지 상태가 없으므로 별도 종료 처리가 필요 없다. 진행 중 Episode는 `incomplete`로 로컬에 남고, 자동 서버 전송은 하지 않는다(`docs/data-learning.md` 원칙).
- **두 세션**: 브라우저 탭/사용자별로 엔진 인스턴스가 분리되므로 상태 혼선이 구조적으로 없다. 서버에 올리는 Episode 업로드(#13)의 동시 쓰기/중복 제출 처리는 이 계약의 범위가 아니다.

## Episode

Header 제안: episode_id, schema_version, scenario_snapshot, scenario_version, engine_version, vehicle/sensor/evaluator version, seed, controller_kind, policy_version 또는 null, 시작 시각, consent 상태/버전, view_mode, assistance flags.

Step 제안: step_index, sim_time_s, observation_t, requested_action_t, applied_command_t, next_state_truth, next_outcome, wall_timestamp. truth는 정책 학습 입력 생성 단계에서 명시적으로 제거한다.

Footer: 종료 사유, 총 simulation time, 이동 거리, 방향 전환 수, 충돌 유무, 최종 위치·각도 오차, success, 기록 완전성.

controller_kind 후보: human / planner / learned / mock. 기록 playback은 새 제어자 학습 실행이 아니므로 원본 controller와 playback 모드를 함께 표시한다. learned는 실제 artifact와 policy_version이 있어야 한다.

로그가 중간에 끊기면 incomplete로 남긴다. 실행 횟수를 성공 사례만으로 집계하지 않는다. 상호 비교는 scenario snapshot·vehicle·초기조건·evaluator 버전이 같은 경우에만 수행한다.

[예시 Episode 조각](../examples/episodes/reverse-bay-straight.v1.json)은 reset 1회 + step 2회(직진)의 최소 형태이며 위 dt/부호 규칙을 그대로 따른다.

## 성공/종료

성공은 목표 공간에 차체가 포함되고, 목표 pose 오차·정지 속도·유지 시간의 기준을 충족한 경우로 정의할 것을 제안한다. 위치/각도/속도 임계와 예산은 [#9](https://github.com/yumina0616/ai-championship-2026/issues/9)에서 테스트로 확정한다.

충돌·timeout·user_abort·disconnect·engine_error·policy_error·success를 구분한다. 같은 tick에 충돌과 성공 조건이 발생하면 **충돌을 우선**한다(확정 — 다른 순서는 이 문서를 갱신해야 적용 가능).

`disconnect`는 브라우저 엔진에서는 발생하지 않는다(탭 종료=프로세스 종료). 서버에 엔진을 다시 둘 경우에만 의미가 생기므로, 현재는 예약된 값으로만 남긴다.

## 확정 체크리스트

- [x] 기존 엔진에서 좌표/기준점/단위/부호 실측 — `docs/integration-spike.md`의 ROS2/Gazebo spike로 완료(엔진 자체는 채택하지 않았지만 수식 검증에 사용).
- [x] 같은 입력을 두 구현 경계에서 읽는 fixture 준비 — `examples/scenarios/reverse-bay.v1.json` + 신규 `examples/episodes/reverse-bay-straight.v1.json`.
- [x] step 적용 시점과 센서 정렬, 종료 우선순위 확정 — 위 "엔진 인터페이스"·"성공/종료" 절.
- [x] 정책 입력과 truth 접근 범위 확정 — "관측과 정답의 분리" 절, 기존 내용 유지.
- [ ] 정상/비정상/누락/중복/세션 reset 예시 검사 — fixture는 추가했으나(`invalid-overlap-start.v1.json`), 실행 가능한 테스트는 #5에서 TS 엔진 코드와 함께 추가한다(현재 저장소에 TS 프로젝트가 없음).
- [ ] schema 버전과 변경 영향, 두 사람 리뷰 기록 — 이 PR 리뷰에서 JH-9568 확인 필요.
