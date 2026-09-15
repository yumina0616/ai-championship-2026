# Issue·브랜치·커밋·PR 규칙

## 작업 단위

Issue 하나는 검증 가능한 결과 하나를 목표로 합니다. 제목만 쓰지 말고 목표·담당·선행·입출력·범위·완료 조건·테스트·제외 범위를 적습니다. 선행 작업은 `#번호`로 연결합니다.

- `priority:P0`: 제출 MVP 목표. 제출 마일스톤에 포함.
- `priority:P1`: 후속 확장.
- `status:blocked`: 필요한 계약/선행 PR을 기다리는 상태.
- 담당자가 착수 댓글과 브랜치를 남기고, PR을 올리면 링크를 추가합니다.
- 별도 In Progress 라벨/보드는 아직 운영하지 않습니다. Issue 상태와 PR 링크로 관리합니다.
- 작업을 넘길 때 완료/남은 점/명령/실패 로그를 기록하고 담당을 바꿉니다.

완료 조건이 충족되지 않았는데 일정 때문에 Issue를 닫지 않습니다. 축소/보류 시 근거와 남은 Issue를 남깁니다.

## 브랜치 전략

main 하나를 통합 기준으로 사용합니다. 별도 develop/release 브랜치를 만들지 않습니다.

```bash
git switch main
git pull --ff-only
git switch -c feature/4-web-foundation
```

형식은 `feature/<issue-number>-<short-name>`입니다. 예: `feature/2-simulator-spike`, `feature/6-parking-editor`.

짧은 수명의 Issue 브랜치를 사용합니다. 선행 PR이 필요한 코드는 main 병합 후 이어가며, 급히 branch-on-branch가 필요하면 base와 병합 순서를 PR에 명시합니다. 타인의 브랜치를 force push하지 않습니다.

main 직접 개발/커밋/푸시는 원칙적으로 금지합니다. 예외는 빈 저장소의 최초 문서 bootstrap뿐입니다. 제출 후 수정도 Issue→branch→PR을 따릅니다.

## 커밋 언어

영문 conventional prefix + 콜론 + 공백 + 한국어 제목:

```text
feat: 장애물 배치와 삭제 기능 추가
fix: 후진 시 조향 부호 오류 수정
docs: 센서 관측 계약과 예시 보완
test: 차체 모서리 충돌 사례 추가
refactor: 차량 좌표 변환 중복 제거
chore: 웹 빌드 검증 워크플로 추가
```

구현하지 않은 결과를 제목에 쓰지 않습니다. 한 커밋에는 이해 가능한 관련 변경을 묶습니다. 비밀키나 원시 사용자 데이터를 커밋하지 않습니다.

## PR

제목·본문은 한국어로 작성합니다. 제목도 `feat: 주차장 편집 기능 추가` 형식을 권장합니다.

본문은 저장소 템플릿에 따라 배경, 변경, 계약/의존 영향, 실제 테스트 명령/결과, 화면 또는 로그, 제한/남은 작업을 적습니다.

완료하는 Issue는 별도 줄로 연결합니다:

```text
Closes #6
```

일부만 처리하면 `Refs #6`을 쓰고 닫지 않습니다. 여러 Issue를 실제로 완료했다면 각각 Closes 줄을 둡니다.

- 초안 PR은 연결이 미완성임을 명확히 표시합니다.
- UI PR은 화면/동영상, 엔진 PR은 입출력 로그·테스트, 학습 PR은 artifact manifest와 전체 평가 결과를 첨부합니다.
- 선행 Issue가 풀리면 담당자가 blocked를 해제합니다.
- 공통 계약 변경은 생산자·소비자·fixture·문서를 함께 갱신합니다.

## 리뷰·병합

상대 팀원 1인의 리뷰와 CI 통과를 확인한 뒤 squash merge합니다. 기능 누락/데이터 안전/계약 오류는 해결하고, 스타일 취향으로 병합을 장기간 막지 않습니다.

병합자는 squash 커밋의 한국어 제목·Issue 연결을 확인하고 완료된 브랜치를 삭제합니다. 로컬의 다른 사람 작업을 지우거나 main을 강제 덮어쓰지 않습니다.

현재 규칙은 협업 문서이며 GitHub 보호 설정이 강제 적용되었다는 뜻은 아닙니다. 저장소 소유자는 main PR 필수, 승인 1명, `문서 검증` check 필수, force push 차단을 설정하는 것을 권장합니다. 사용 권한/요금제에서 지원하는지 확인하고 설정 결과를 기록합니다.

## 테스트와 Definition of Done

현재 로컬 검증:

```bash
python3 scripts/check_docs.py
python3 -m unittest discover -s tests -v
git diff --check
```

문서 검사기는 상대 Markdown 파일 링크의 존재와 JSON 문법을 검사합니다. 외부 URL 접속, heading anchor, 모든 Markdown 문법, 차량 물리/센서/학습 품질은 검사하지 않습니다.

앱 변경에는 엔진의 `npm run typecheck`/`npm test`, 웹의 `npm run build`/`npm test`를 해당 폴더에서 추가 실행합니다. 첫 설치와 Chromium 설치는 [웹 개발 안내](../web/README.md)를 따릅니다. `웹·엔진 검증` workflow가 엔진 타입·Vitest, 웹 빌드·Playwright를 검사합니다. 웹 artifact는 배포 URL이 아닙니다. 데이터·학습 기능이 추가되면 동의/권한·관측·artifact·평가 분리 검사를 함께 추가합니다. 없는 테스트를 통과했다고 적지 않습니다.

완료 조건: Issue 충족 + 관련 테스트 + 문서/예시 일치 + 리뷰 + CI + 실제 확인 가능한 증거. 데모는 mock인지 실제인지 표시합니다.

## 매일 공유

각자 Issue 댓글에 오늘 완료, 다음 할 일, 막힌 계약/결정, PR 링크를 남깁니다. 엔진/좌표/데이터 계약 변경은 채팅 합의만으로 끝내지 않고 문서 PR에 기록합니다.
