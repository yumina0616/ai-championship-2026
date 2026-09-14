# 개발자와 Coding Agent 작업 지침

이 저장소는 참여형 주차 시뮬레이터 프로젝트입니다. Rigmetry와는 별개이며 기존 프로젝트의 스택·담당·계약을 가져오지 않습니다.

## 먼저 읽기

1. [README](README.md): 제품과 실제 구현 상태
2. [제품 계획](docs/product.md): 두 모드와 MVP 범위
3. [개발 계획](docs/mvp-plan.md): 본인 담당 Issue와 선행 작업
4. [재사용 검증](docs/integration-spike.md): 엔진 선택 상태
5. [아키텍처](docs/architecture.md)와 [공통 계약](docs/contracts.md)
6. [데이터와 학습](docs/data-learning.md)
7. [개발 규칙](docs/development.md), [CONTRIBUTING](CONTRIBUTING.md)
8. 담당 GitHub Issue 본문, 선행 PR, 변경할 코드와 테스트
9. 배포·제출 작업이면 [제출 체크리스트](docs/release-checklist.md)

문서의 초안과 구현된 사실을 구별합니다. Issue를 읽지 않고 기능부터 구현하지 않습니다.

## 시작 전

- `git status --short --branch`로 브랜치와 타인의 변경을 확인합니다.
- 담당·완료 조건·선행 Issue를 확인합니다. blocked는 이유를 해결한 후 제거합니다.
- 브랜치는 `feature/<issue-number>-<short-name>`입니다. main에 직접 개발하지 않습니다.
- 엔진이 미확정이면 임의로 Gazebo/Isaac/CARLA/ROS 버전을 고정하지 않습니다.
- 기존 코드는 위치·실행 방법·권한·라이선스를 확인한 후 재사용합니다.
- 공개 계약 변경은 두 담당이 검토하고 영향받는 Issue/예시를 함께 바꿉니다.
- 새 핵심 기능은 Issue부터 만듭니다. 사용자 요청이 Issue 생성 권한까지 포함하는지 확인합니다.

## 구현 경계

- 화면 렌더링 FPS가 차량 시뮬레이션 시간을 결정하지 않습니다.
- 사람과 정책은 같은 차량·센서·충돌·평가 구현을 사용합니다.
- 정책 입력에 비허용 정답 장애물·미래 state·평가 결과를 섞지 않습니다.
- 센서 연출, planner, mock, playback을 실제 인식/학습 정책이라고 표기하지 않습니다.
- 이상적 위치 입력, 노이즈 가정, 지원 차량/환경을 공개합니다.
- 임의 맵/문자열을 서버 명령이나 코드를 실행하는 입력으로 사용하지 않습니다.
- 사용자 연습은 기본 로컬입니다. 서버 기록과 학습 기여는 명시적 동의 후에만 수행합니다.
- 비밀키·.env·식별 가능한 사용자 기록·모델 대용량 파일은 Git에 넣지 않습니다.
- 사용자 운전 데이터 증가를 곧바로 성능 증가로 간주하지 않습니다.
- 기존 의존성/기능을 먼저 재사용하고 필요한 경계만 만듭니다. 실행 엔진 2개를 동시에 새로 만들지 않습니다.

## 검증과 완료

```bash
python3 scripts/check_docs.py
python3 -m unittest discover -s tests -v
git diff --check
```

현재는 문서 검사만 있습니다. 기능 추가 PR은 해당 스택의 빌드·타입 검사·기능 테스트를 실제 추가하고 CI와 개발 규칙을 갱신해야 합니다. 위 명령 통과를 서비스 테스트 통과로 설명하지 않습니다.

계약·동작이 바뀌면 코드·테스트·예시·문서를 같은 PR에서 갱신합니다. 구현 결과·실행한 검사·남은 한계를 한국어로 보고합니다.

커밋은 `feat: 주차장 장애물 편집 추가`처럼 영문 prefix와 한국어 제목을 씁니다. PR 제목·본문·Issue도 한국어로 쓰고 `Closes #번호`로 연결합니다.

사용자 요청으로 허용된 GitHub 작업만 수행합니다. Commit/Push/Issue 작성/PR 생성/Merge는 현재 요청의 권한 범위를 확인하고, 단순 검토 요청에서 임의로 수행하지 않습니다. 첫 빈 저장소의 문서 bootstrap만 main 초기 커밋 예외입니다.
