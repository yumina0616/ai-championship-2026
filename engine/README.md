# engine — 저속 차량 제어·충돌·센서·기준 제어기 (Issue #5, #7, #9)

`docs/contracts.md`의 "엔진 인터페이스"를 구현한 TypeScript 모듈. React에 의존하지 않는 순수 로직 패키지이며 `web/src/driving.ts`에서 import하여 실제 수동 주행에 사용한다. 기준 제어기는 아직 웹 관전 모드에 연결하지 않았다.

## 범위

- 포함: rear-axle kinematic bicycle model(`src/vehicle.ts`), 회전 직사각형 footprint 충돌·world bounds 검사(`src/collision.ts`), ray-box 거리 센서(`src/sensor.ts`), 목표 상대좌표 변환(`src/goal.ts`), 성공/충돌/timeout 판정을 포함한 `reset()`/`step()` 상태기계(`src/engine.ts`), 제한된 후진주차 기준 제어기(`src/baselineController.ts`), Episode rollout 생성과 train/validation/heldout 분리(`src/rollout.ts`).
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
- `src/baselineController.ts`는 목표점을 향한 순수추종(pure pursuit)을 "항상 후진" 전제로 적용한 제한된 기준 제어기다. Hybrid A* 같은 장애물 회피 경로탐색이 아니다 — **실제로 `examples/scenarios/reverse-bay.v1.json`(주차된 옆 차량 2대 + 기둥)에 돌려보면 58 step(2.9s) 만에 옆 차량과 충돌한다.** 장애물이 없는 단순 오프셋에서는 잘 수렴한다(`test/baselineController.test.ts`). 이 실패는 숨기지 않고 `test/rollout.test.ts`가 있는 그대로("success"/"collision"/"timeout" 중 실제 결과) 검증한다 — 장애물 회피가 필요한 실제 경로계획은 이 PR의 범위 밖이다.
- `runBaselineRollout()`은 위 제어기로 scenario 하나를 실제로 끝까지 돌려 `docs/contracts.md` 형태의 Episode를 만든다. `controller_kind: "planner"`이고 `header.metadata.plannerUsesTruth: true`로 이 제어기가 센서가 아니라 `poseTruth`/`goalPose`를 직접 받는다는 사실을 명시한다.
- `splitScenariosByLayoutGroup()`은 `docs/data-learning.md`의 "같은 맵/trajectory가 여러 분할에 새지 않게 레이아웃군 단위로 나눈다" 원칙을 구현한다 — `scenario.layoutGroup`(없으면 scenarioId)이 같으면 항상 같은 split에 들어간다.
