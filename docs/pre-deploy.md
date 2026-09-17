# 배포 전 인수인계

후속 업데이트(2026-09-17): Cloudflare 공개 테스트 웹·비공개 R2 연결을 배포했습니다. 실제 사용자 서버 수집은 꺼져 있습니다. 아래는 9/16 당시 인수인계이며 최신 운영 정보는 [Cloudflare 배포 안내](cloudflare-deployment.md)를 따릅니다.

2026-09-16 로컬 통합 작업입니다. 공개 배포·도메인·유료 서비스·실제 사용자 수집은 하지 않았습니다. 최종 공개 검증은 [#15 체크리스트](release-checklist.md)에 남습니다.

## 지금 확인할 흐름

1. `npm --prefix web ci` → `npm --prefix web run dev`, 로컬 주소를 엽니다.
2. 차고에서 프리셋 또는 편집 맵을 선택하고 직접 운전한 뒤 기록을 남깁니다.
3. 같은 맵을 유지한 채 **마스코트 실험 모델**을 선택합니다. 실제 MLP가 동일 엔진으로 운전하며 사람 조향/페달은 비활성화됩니다. 일시정지·중단·실패도 기록됩니다.
4. 「내 주행 기록」에서 두 시도를 비교에 추가합니다. 설정이 다르면 거부하고, 같으면 경로·전체 종료 이유·공통 지표·시점/도움 차이를 봅니다.
5. 편집기의 맵 내보내기에서 링크를 만들고 다른 탭에서 열어 확인 후 적용합니다. localhost 링크는 외부 사람의 컴퓨터에서는 열리지 않습니다.
6. [로컬 API 안내](../server/README.md)를 따라 **합성 기록만** 동의→저장→권한 확인→삭제합니다. 실제 사용자 데이터를 넣지 않습니다. production UI에는 이 테스트 패널이 없습니다.

## 자동 검사

```bash
npm --prefix engine ci
npm --prefix engine run typecheck
npm --prefix engine test
npm --prefix training ci
npm --prefix training run typecheck
npm --prefix training test
npm --prefix web ci
npm --prefix web run build
npm --prefix web run test:local-api
PARKSIDE_TEST_LOW=1 npm --prefix web run test:production
cd web
npx playwright install chromium
PARKSIDE_TEST_LOW=1 npm test
cd ..
python3 scripts/check_docs.py
python3 -m unittest discover -s tests -v
git diff --check
```

`PARKSIDE_TEST_LOW`는 브라우저 테스트의 렌더 품질만 낮추며 물리/센서/모델을 바꾸지 않습니다. CI는 별도로 Linux Mesa(llvmpipe) WebGL과 3개 shard를 사용합니다. 로컬 통과와 GitHub CI 통과는 구분해서 기록합니다.

로컬 검사 결과: 엔진 타입/65 tests, 학습 타입/14 tests, 웹 build/66 Playwright tests, 로컬 HTTP API 3 tests, 정적 빌드 실제 모델 smoke 1 test 통과. 문서 24개/예시 JSON 7개에서 오류 0개, 문서 검사기 7 tests 통과. 테스트 통과는 모델의 주차 성능이나 실제 기기 GPU 성능 보장이 아닙니다.

## 남아 있는 결정과 담당

| 항목 | 담당 | 완료 기준 |
| --- | --- | --- |
| #12/#14 변경 리뷰 | yumina0616 | 정책 feature/command 계약·동일 초기조건·실패 기록 확인 후 PR 리뷰 |
| 모델 성능·실측 결과 | yumina0616, 공동 검토 | 현재 heldout 0/1을 숨기지 않고 원인/지원 범위를 확인. 재학습 시 새 체크섬·분리 평가·전체 분모 유지 |
| #13 실제 기여 범위 | 공동 | 실제 수집 여부부터 결정. 수집한다면 서버·예산·보관 기간·권한·철회·미래 학습 snapshot 정책 확정 및 별도 구현/검증 |
| 프로젝트 라이선스 | 공동 | 소유 코드·의존성·모델·에셋 권리 확인 후 팀이 선택. 에이전트가 임의로 MIT 확정하지 않음 |
| 공개 배포와 운영 | JH-9568, 백업 yumina0616 | 정적 웹 호스팅/URL·비용 상한·점검 담당을 결정. 개발용 API는 배포하지 않음 |
| 공개 환경 QA | 공동 | 실기기 iOS Safari/Android·공개 asset 경로·약한 네트워크·장시간 세션·3명 이상 사용성 확인 |
| 대회 접수/제출 | 공동 | 공식 일정 재확인, 참가 등록·서비스 URL·영상·AI 도구/한계 설명·최종 제출 확인 |

서버 정책이 정해지지 않았다는 이유로 직접 운전/실제 AI 관전/비교를 막지는 않습니다. 제출 시 실제 기여는 미제공으로 정직하게 설명하고 #13을 남길 수 있습니다. #16 되감기·#17 참여 재학습·#18 코치는 후속이며 구현 완료로 주장하지 않습니다.

## 운영·복구 초안

정적 배포 대상은 `web/dist/`입니다. 저장소 루트에서 빌드해야 `engine/`과 고정 `training/model/`이 포함됩니다. 공개 설정 변경은 아직 하지 않았습니다. 배포 승인 후 직전 검증 artifact를 보관하고 문제 발생 시 그 artifact로 되돌립니다. 모델을 바꿀 때는 manifest/토폴로지/가중치·정책 파일 호환성을 함께 검토합니다.

Three.js와 TF.js chunk 크기 경고는 남아 있습니다. 정책은 선택 때 지연 로딩하며 가중치는 SHA-256을 검사합니다. 모바일 초기 로딩 시간·실차 교육 효과·운영 동시 접속 성능은 아직 미측정입니다. 초소형 heldout 1건을 일반화 성능으로 주장하지 않습니다.
