# engine — 저속 차량 제어·충돌·센서 (Issue #5, #7)

`docs/contracts.md`의 "엔진 인터페이스"를 구현한 TypeScript 모듈. 웹 UI(React, #4/#6/#8)와 독립적이며, 아직 어디에도 import되지 않은 순수 로직 패키지다.

## 범위

- 포함: rear-axle kinematic bicycle model(`src/vehicle.ts`), 회전 직사각형 footprint 충돌·world bounds 검사(`src/collision.ts`), ray-box 거리 센서(`src/sensor.ts`), 목표 상대좌표 변환(`src/goal.ts`), `reset()`/`step()` 상태기계와 `Observation` 조립(`src/engine.ts`).
- 포함하지 않음: 성공 판정/기준 제어기([#9](https://github.com/yumina0616/ai-championship-2026/issues/9)). `evaluateOutcome()`의 충돌→timeout 순서는 #9가 성공 판정을 끼워 넣을 자리를 미리 비워뒀다(주석 참고). 센서 결측(`valid:false`, 실제 오류/dropout)도 타입만 있고 발생 조건은 아직 없다(`src/sensor.ts` 주석 참고) — 미검출(범위 밖)만 구현했다.

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
