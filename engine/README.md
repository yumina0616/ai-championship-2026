# engine — 저속 차량 제어·충돌·센서·기준 제어기 (Issue #5, #7, #9)

`docs/contracts.md`의 "엔진 인터페이스"를 구현한 TypeScript 모듈. 웹 UI(React, #4/#6/#8)와 독립적이며, 아직 어디에도 import되지 않은 순수 로직 패키지다.

## 범위

- 포함: rear-axle kinematic bicycle model(`src/vehicle.ts`), 회전 직사각형 footprint 충돌·world bounds 검사(`src/collision.ts`), ray-box 거리 센서(`src/sensor.ts`), 목표 상대좌표 변환(`src/goal.ts`), 성공/충돌/timeout 판정을 포함한 `reset()`/`step()` 상태기계(`src/engine.ts`), 반응형 기준 제어기(`src/baselineController.ts`)와 장애물 회피 경로계획기 Hybrid A*(`src/hybridAStar.ts`), Episode rollout 생성과 train/validation/heldout 분리(`src/rollout.ts`).
- 포함하지 않음: 센서 결측(`valid:false`, 실제 오류/dropout)은 타입만 있고 발생 조건은 아직 없다(`src/sensor.ts` 주석 참고) — 미검출(범위 밖)만 구현했다. 학습(#11)은 다른 PR에서 다룬다.

## 실행

```bash
cd engine
npm install
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

## 알아두면 좋은 설계 결정

- `Command`의 절대값은 vehicle spec 한계로 **clamp**하고, `NaN`/`Infinity`는 **거부**(throw)한다(`docs/contracts.md` "엔진 인터페이스" 절).
- 가속/조향 변화율 제한(`maxAccelerationMps2`, `maxSteeringRateRadPerS`)은 기본값(2.0 m/s², 1.5 rad/s)이 코드에 있을 뿐 아직 실제 차량값으로 확정되지 않았다 — PR 리뷰에서 논의 필요.
- 충돌 판정은 차체 전체 footprint(뒷차축 기준 4.4m 박스)를 매 step마다 검사하는 discrete 방식이다. 차체 길이가 한 step 이동거리(최대속도 기준 0.075m)보다 훨씬 길기 때문에 이 범위 내에서는 얇은 장애물도 건너뛰지 않는다(`test/collision.test.ts`의 한계 테스트 참고). 이는 속도/dt 조합이 지금 사양을 한참 벗어나지 않는다는 전제에서만 유효하다.
- `src/scenarioLoader.ts`는 `examples/scenarios/*.json`(snake_case)을 그대로 읽어 실제로 엔진에 흘려본다 — `test/engine.test.ts`가 #3에서 만든 fixture(`reverse-bay.v1.json`, `invalid-overlap-start.v1.json`)를 직접 실행해서 계약 문서와 구현이 일치함을 증명한다.
- 센서 노이즈는 `Math.random()`이 아니라 `scenario.seed` 기반 결정론적 PRNG(`src/rng.ts`, mulberry32)를 쓴다 — #5에서 약속한 "동일 engine·seed·command 재실행은 완전히 같은 결과"를 센서까지 확장 유지한다.
- 센서 갱신주기(`sensor.periodS`)가 물리 dt보다 길면 그 사이 step에서는 이전 값을 그대로 돌려준다(`docs/contracts.md`: "관측 시간과 step이 제어 기록에 정렬"). `RangeReading.updatedSimTimeS`로 실제 갱신 시각을 알 수 있다.
- 성공 판정은 "목표 공간에 footprint 완전 포함 + 위치/각도 오차 + 정지 속도"가 `hold_time_s` 동안 **연속으로** 유지돼야 확정된다. `evaluateOutcome()`은 충돌을 먼저 검사하므로 같은 step에 충돌·성공 조건이 겹치면 항상 충돌이 이긴다(`test/success.test.ts`).
- `src/baselineController.ts`(`runBaselineRollout()`)는 목표점을 향한 순수추종(pure pursuit)을 "항상 후진" 전제로 적용한 가장 단순한 반응형 제어기다. 장애물 회피가 없어서 `reverse-bay.v1.json`(주차된 옆 차량 2대+기둥)에서는 58 step 만에 충돌한다(`test/rollout.test.ts`에 그대로 남겨둠) — 장애물 없는 단순 오프셋에서만 쓸모 있는 참고용으로 남겨뒀다.
- `src/hybridAStar.ts`(`runHybridAStarRollout()`)가 실제 학습 데이터 생성에 쓰는 **장애물 회피 경로계획기**다. 격자 A*가 아니라 "실제 차량이 낼 수 있는 움직임(조향각 5종 × 전진/후진 = 10개 motion primitive)"으로 상태공간을 탐색한다. 원래 Hybrid A*는 보통 Reeds-Shepp 곡선도 같이 쓰지만, 이 구현은 유클리드 거리 휴리스틱만 쓰는 축소판이다(정직하게 명시 — 일정상 "장애물을 실제로 피해서 도착하는" 것 자체를 우선했다).
  - **핵심 정합성 포인트**: 계획 단계도 `clampCommand`(가속/조향 변화율 제한)를 매 substep마다 실제 engine과 똑같이 적용한다. 처음엔 이걸 안 했다가 "계획에서는 안 부딪히는데 실제 engine.step()으로 재생하면 부딪히는" 문제를 실제로 겪었다 — 계획이 "순간적으로 목표 속도에 도달한다"고 가정하면 실제로는 느리게 가속하는 동안 궤적이 달라져서 생기는 문제였다.
  - **실측 결과**: `examples/scenarios/reverse-bay.v1.json`에서 계획 3891 노드 확장(~4초) 만에 경로를 찾고, 그 경로를 실제 engine에 그대로 재생하면 **충돌 없이 success로 종료**된다(`test/hybridAStar.test.ts`). baseline(반응형)이 충돌하던 바로 그 시나리오다.
  - 계획이 끝난 직후엔 보통 아직 감속 중이라 곧바로 `stopped_speed_mps`/`hold_time_s` 조건을 못 채운다 — `appendHoldCommands()`가 감속 시간+hold_time_s만큼 정지 command를 더 붙여준다.
  - 경로를 못 찾으면(막다른 목표 등) `found: false`를 반환한다 — 무한루프 대신 `maxExpansions`로 안전판을 둔다.
- `runHybridAStarRollout()`/`runBaselineRollout()` 둘 다 위 제어기로 scenario 하나를 끝까지 돌려 `docs/contracts.md` 형태의 Episode를 만든다. `controller_kind: "planner"`이고 `header.metadata.plannerUsesTruth: true`로 이 제어기가 센서가 아니라 `poseTruth`/`goalPose`를 직접 받는다는 사실을 명시한다.
- `splitScenariosByLayoutGroup()`은 `docs/data-learning.md`의 "같은 맵/trajectory가 여러 분할에 새지 않게 레이아웃군 단위로 나눈다" 원칙을 구현한다 — `scenario.layoutGroup`(없으면 scenarioId)이 같으면 항상 같은 split에 들어간다.
