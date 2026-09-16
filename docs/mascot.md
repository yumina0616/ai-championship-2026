# 마스코트 실시간 학습 정책

구현: #12. 차고에서 **마스코트 실험 모델 → 마스코트 운전 보기**를 선택합니다. 같은 프리셋/편집 맵 snapshot을 직접 운전과 공유하고 같은 엔진·고정 dt 0.05초·충돌·주차 판정을 사용합니다. 모델을 다시 학습하거나 성공 경로를 재생하는 기능은 아닙니다.

## 추론 경계

- `training/model/`의 실제 행동복제 MLP를 TensorFlow.js 4.22.0 CPU backend로 실행합니다. Three.js WebGL 문맥과 분리하고 모델 chunk/가중치는 선택 시 지연 로딩합니다.
- manifest의 SHA-256과 배포 가중치를 대조합니다. 모델 버전은 `policyVersion@artifactChecksumSha256`으로 기록합니다. 모델 교체 시 manifest·가중치·토폴로지를 함께 검토합니다.
- 공유 `training/src/features.ts`로 거리 센서 36개, 속도, 조향, 목표 상대 위치/각도(총 41개)를 변환하고 2개 출력으로 속도·조향을 생성합니다. truth 장애물 목록·절대 pose·평가 결과는 정책에 전달하지 않습니다.
- 상대 목표는 **시뮬레이터의 이상적 위치 추정**에 의존합니다. 카메라 비전/SLAM/실차 센서 모델은 아닙니다. 지정 차량과 무잡음 36-ray 배치만 지원하며 다른 차량·센서는 시작 전에 거부합니다.
- 수동 핸들·기어·페달은 비활성화하고 카메라 변경·일시정지·종료만 허용합니다. 실패 시 기준 제어기로 조용히 대체하지 않습니다.
- 취소·종료·unmount 시 모델을 해제하고 각 추론의 tensor를 폐기합니다. 로딩/체크섬/shape/finite 오류는 안내하고 추론 오류는 `policy_error` 불완전 기록으로 남깁니다.

## 현재 성능과 기록

현재 artifact `parking-mlp-v1`, 체크섬 `1f5b7772bc4322d3e0a418cd99e5b41983068c16fab027fba87ad56dc7487681`입니다. [학습 파이프라인](../training/README.md)의 소규모 heldout 결과는 **성공 0/1, 충돌 1/1**입니다. 웹 사용자 편집 맵에서의 성능은 검증되지 않았으며 주차 성공을 보장하지 않습니다. 센서/차량 호환성은 성능 보장이 아닙니다.

로컬 저장을 켜면 `controllerKind=learned`, pinned policy version, `spectator` 시점 맥락, 실제 관측·행동·종료를 기록합니다. 사람의 입력은 빈 배열/아날로그 조향 null입니다. 기존 human 파일은 유지하지만 임의의 planner/unknown policy 기록은 받아들이지 않습니다. 정책 버전 교체 시 과거 learned 파일 지원은 별도 마이그레이션 범위입니다.

첫 화면의 자동 주차 오프닝은 계속 **기준 제어기 기록 재생**이며 이 모드와 다릅니다. 모델 실행 중 나온 실패·중단·timeout을 삭제하거나 성공으로 꾸미지 않습니다.

검증: `npm --prefix web run build`, `npm --prefix web test -- tests/mascot.spec.ts tests/episodes.spec.ts`. 실제 artifact 추론·메모리 해제·손상 가중치·지원 규격·수동 입력 차단·중단 기록을 검사합니다.
