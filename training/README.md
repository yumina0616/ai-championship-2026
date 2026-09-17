# training — 초기 주차 정책 학습 (Issue #11)

참여 데이터 후속 #17: [수집·오프라인 학습 인수인계](../docs/collection.md). `npm run community -- export/prepare/compare`와 `npm run train -- <dataset> <새 후보 폴더>`를 추가했다. 실제 사용자 데이터 학습/공개 모델 교체는 아직 실행하지 않았으며 기존 결과를 개선 결과로 바꾸지 않는다.

`engine/`이 만든 Hybrid A* rollout으로 작은 행동복제(behavior cloning) MLP를 학습하고, 학습에 안 쓴(heldout) scenario에서 평가한다. `engine/`을 소스 상대경로로 직접 import한다(별도 npm 패키지로 배포하는 게 아니라 같은 monorepo 안의 형제 폴더).

## 실행 순서

```bash
cd training
npm install
npm run generate-dataset   # examples/scenarios/*.json -> Hybrid A* rollout -> data/*.json
npm run train               # data/train.json(+validation.json) -> model/model.json,weights.bin
npm run evaluate             # model/ + data/heldout-scenarios.json -> model/eval-report.json, model-manifest.json
```

`data/`는 `.gitignore`에 있다 — `generate-dataset`으로 언제든 재현 가능한 파생 산출물이라 커밋하지 않는다. `model/`(모델 자체 + manifest + 평가 결과)은 작고(수 KB) 순수 synthetic 데이터로만 만들어져서 커밋한다.

## 왜 @tensorflow/tfjs(순수 JS)인가

처음엔 `@tensorflow/tfjs-node`(네이티브 C++ 백엔드, 훨씬 빠름)를 쓰려 했는데, 이 Windows 환경에서 네이티브 바인딩(`tfjs_binding.node`)이 `ERR_DLOPEN_FAILED`로 로드에 실패했다 — #2의 WSLg/Gazebo GPU 문제와 같은 종류의 "플랫폼별 네이티브 의존성" 리스크다. 모델이 아주 작아서(수십~수백 파라미터) 순수 JS CPU 백엔드로도 충분히 빠르길래, 대신 **브라우저와 완전히 같은 `@tensorflow/tfjs` 패키지**로 바꿨다. 학습(Node)과 추론(브라우저)이 같은 런타임을 쓰게 되는 부수 이득도 있다.

`@tensorflow/tfjs`(순수 JS)에는 Node용 `file://` 저장/로드 IOHandler가 없어서, `src/modelIO.ts`가 표준 브라우저 포맷(model.json + weights.bin, `weightsManifest` 포함)을 직접 읽고 쓴다 — 그래서 나중에 브라우저에서 `tf.loadLayersModel('/model/model.json')`으로 그대로 불러올 수 있다.

## 데이터 파이프라인에서 실제로 겪은 문제

`generateDataset.ts`를 처음 돌렸을 때 `parkside-neighbors-v1`/`parkside-pillar-v1`(옆 차량이 붙어 좁은 레이아웃)에서 Hybrid A*가 "계획은 찾았다(found=true)"고 하는데 실제 engine 재생은 충돌로 끝났다. 원인: 계획이 목표 tolerance를 "이동 중"에 만족한 순간을 goal로 인정했는데, 그 뒤 정지하려고 감속하는 동안(가속 제한 때문에 순간 정지가 안 됨) 관성으로 조금 더 나아가 바로 옆 장애물과 부딪혔다. `engine/src/hybridAStar.ts`의 `isGoal()`을 고쳐서, goal 후보를 찾으면 "완전히 멈출 때까지 시뮬레이션해도 충돌이 없고, 멈춘 뒤의 위치도 여전히 tolerance 안"인지까지 확인하도록 했다(`simulateStopFromNode()`). 이후 4개 시나리오 전부 성공.

## 학습 데이터·평가 결과 (2026-09-16, 커밋 시점 실측)

- 학습: `parkside-open-v1`, `parkside-neighbors-v1`(train) + `parkside-pillar-v1`(validation) — 웹이 실제로 노출하는 세 템플릿([web/src/driving.ts](../web/src/driving.ts)) 그대로. train 1092개, validation 594개 (observation, action) 쌍.
- heldout: `examples/scenarios/reverse-bay.v1.json`(엔진 개발용 synthetic fixture) — **성공률 0%, 충돌률 100%**(`training/model/eval-report.json`).
- **이 실패를 숨기지 않는 이유**: heldout 시나리오는 목표 pose가 yaw=0인데 학습/검증 데이터는 전부 yaw=-90도(같은 방향 주차)였다 — 학습 데이터에 없던 종류의 회전을 요구하는, 특히 어려운 일반화 테스트다. 실제 웹 서비스가 사용자에게 보여주는 템플릿(open/neighbors/pillar)은 전부 학습·검증에 포함되어 있다. 이 결과는 "이 초기 모델은 학습 데이터와 비슷한 방향의 주차만 지원 범위"라는 뜻이며, `docs/data-learning.md`의 "결과가 나빠도 숨기지 않는다", "미평가 맵은 성능 보장하지 않는다" 원칙을 그대로 따른다.
- 현재 artifact의 최종 train loss ≈ 0.000816, validation loss ≈ 0.007073 (`training/model/train-run.json`, seed 42 재학습). 작은 지도학습 loss가 실제 폐루프 주차 성공을 보장하지는 않는다.

## 알아두면 좋은 설계 결정

- 입출력 스키마·정규화 상수는 `src/features.ts`에 고정돼 있다 — 지금 모든 fixture가 같은 차종(`synthetic-compact-v1`)·같은 센서 배치(36-ray)를 쓰기 때문이다. 다른 차종/센서 개수를 지원하려면 이 부분부터 scenario 기준으로 다시 계산해야 한다.
- 학습 입력은 `Observation`(센서+속도/조향각+목표 상대좌표)만 쓴다 — `poseTruth`/전체 장애물 좌표는 접근하지 않는다(`docs/contracts.md` "관측과 정답의 분리"). 이는 Hybrid A*/pure-pursuit 기준 제어기(truth 접근 허용)와 다른 점이며, `src/policyController.ts` 주석에 명시했다.
- `generateDataset.ts`는 실패(충돌/timeout/계획 실패)한 rollout을 학습 데이터에서 자동으로 제외한다(`docs/data-learning.md`: "잘못된 조작을 무조건 정답 행동으로 학습시키지 않는다").
- train/validation/heldout은 `splitScenariosByLayoutGroup()`(engine)으로 시나리오(레이아웃) 단위로 나눈다 — 같은 맵이 여러 분할에 새지 않는다.
- model manifest(`model/model-manifest.json`)에 checksum·프레임워크·관측/행동 스키마·지원 차종·학습 데이터 스냅샷·코드 commit·평가 결과 위치를 기록한다(`docs/data-learning.md`의 "Manifest 최소 정보" 그대로).
