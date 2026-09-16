# 로컬 주행 기록과 상태 재생

구현: #10/#12/#14. 차고의 **내 주행 기록**에서 목록·파일 열기·내보내기·삭제와 탑뷰 상태 재생, [같은 조건의 시도 비교](comparison.md)를 제공합니다. 보관을 켜면 실제 운전의 고정 dt 0.05초마다 기록합니다. 차고에서 [로컬 보관을 끄는 선택](local-sharing.md)도 제공합니다. 재생은 저장한 state를 표시하며 엔진 step이나 AI 추론을 호출하지 않습니다. 재생 경로는 뒷차축 기준이고 UI에 human/learned·실제 정책 버전·종료 사유를 표시합니다.

## 저장 범위

- 브라우저 원본(origin)별 IndexedDB `parkside-local/episodes`에 최근 5개를 보관합니다. 여섯 번째부터 시작 시각이 가장 오래된 기록을 제거합니다. 시크릿 모드·사용자 삭제·브라우저 정책에 따라 보관을 보장하지 못합니다.
- 서버 업로드, 계정 연동, 학습 기여는 없습니다. consent는 `not_requested`, version은 null입니다. 공개 데이터셋으로 사용하기 위한 동의가 아닙니다.
- 시작과 매 simulation 1초마다 `incomplete` 체크포인트를 원자적으로 교체하고 정상 종료 시 최종 기록을 저장합니다. 탭 강제 종료는 마지막 완료된 체크포인트만 남으며 저장 지연·저장소 오류로 더 많은 tick이 유실될 수도 있습니다. 완전성은 검증된 서버 로그 수준이 아닙니다.
- 중단은 `user_abort`, 엔진 오류는 `engine_error` + logComplete=false로 보존합니다. collision/timeout/success도 보존하며 UI의 성공 후 P 확인은 엔진 성공 조건이 아닙니다.
- 저장 실패 시 안내하며 마지막 메모리 기록의 파일 내보내기를 제공합니다. 페이지를 닫으면 메모리 기록은 사라집니다. 개별/전체 삭제는 이 브라우저 사본에만 적용되고 다운로드 파일은 지우지 않습니다.

## parkside-episode.v1

엔진 `Episode` 타입에 initial StepResult와 각 step의 nextObservation/rawInput을 더한 웹 기록입니다. 기존 synthetic snake_case 예시와 다른 버전이며 이를 암묵적으로 변환하지 않습니다. 현재 human 및 [고정 모델의 learned](mascot.md) 웹 v2 프리셋/편집기 v1을 지원합니다. planner와 미지원 정책 버전은 거부합니다. learned 기록은 전체 정책 체크섬을 보존하고 수동 입력은 비어 있습니다. `policy_error`는 불완전 실패 기록입니다.

| 경계 | 기록 |
| --- | --- |
| header | UUID, schema/engine/scenario version, 전체 Scenario snapshot(차량·센서·평가 포함), seed, human/learned, policyVersion(null 또는 체크섬 포함), 시작 시각, 동의 상태, 최초 시점·도움 |
| initial | reset 직후 관측·정답 pose·t=0 |
| step | 연속 stepIndex, 적용 후 simTimeS, 적용 전 observationT, requestedActionT, appliedCommandT, nextStateTruth, nextObservation, nextOutcome, wallTimestamp |
| rawInput | 기어, 페달/좌우 입력 집합, 아날로그 조향, 시점, 센서선/격자/후방 가이드/음향/주차 안내/조향 복원 도움 |
| footer | 종료 사유, 전체 sim time, 이동 거리, 실제 signed speed 방향 전환 수, 충돌/성공, 최종 오차, logComplete |

요청 command는 사람이 키를 누른 것과 다릅니다. 키/페달은 rawInput, 수동 어댑터 출력은 requestedActionT, 엔진 clamp 후 값은 appliedCommandT입니다. 시점이나 truth 기반 안내를 사용한 기록을 곧바로 센서 전용 정책 학습 데이터로 삼지 않습니다.

파일은 compact JSON, 최대 16 MiB, 1,801 step, 36 ray입니다. 결측 센서는 valid=false/rangeM=null로 직렬화하고 읽을 때 NaN으로 복원합니다. 미검출(valid=true/max range)과 다릅니다. 파일을 여는 것은 자동 보관·서버 업로드가 아닙니다.

검사: 지원 버전·고정 구성, 유한 수치·범위·배열 상한, 연속 step/time, 관측 앞뒤 정렬, 종료 후 추가 step 금지, 마지막 outcome/footer 일치, footer 재계산. 신뢰할 수 없는 파일을 코드로 실행하지 않습니다. **형식·내부 일관성 검증이지 암호학적 진위 증명이나 모든 물리 step 재실행 검증은 아닙니다.** 학습 반영 전 별도 오프라인 검증이 필요합니다.

검증 명령: `cd web && npm test -- tests/episodes.spec.ts` 및 `npm run build`.
