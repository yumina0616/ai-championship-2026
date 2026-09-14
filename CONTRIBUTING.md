# 기여 안내

먼저 [README](README.md), [AGENTS](AGENTS.md), [개발 계획](docs/mvp-plan.md), [개발 규칙](docs/development.md)을 읽습니다.

1. 기존 Issue를 검색하고 담당자·선행 작업·완료 조건을 확인합니다.
2. `feature/<issue-number>-<short-name>` 브랜치에서 하나의 검증 가능한 결과를 구현합니다.
3. 공통 계약이 바뀌면 두 담당에게 먼저 영향 범위를 공유합니다.
4. 테스트·예시·문서를 같은 PR에 포함합니다.
5. 한국어 PR에 `Closes #<issue-number>`와 검증 결과를 씁니다.
6. 다른 팀원의 리뷰와 CI 확인 후 squash merge합니다.

문서 검증은 `python3 scripts/check_docs.py`, 검사기 테스트는 `python3 -m unittest discover -s tests -v`입니다. 앱 테스트는 구현 시 추가합니다.

원시 사용자 데이터·비밀키·허가받지 않은 외부 코드/모델/에셋을 제출하지 않습니다. 아직 프로젝트 라이선스가 합의되지 않았으므로 외부 코드 반입이나 권리 부여는 담당자와 먼저 확인합니다.
