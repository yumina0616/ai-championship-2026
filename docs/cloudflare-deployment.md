# Cloudflare 공개 배포

2026-09-17, #13/#15. 공개 주소: https://parkside-parking.jinhyeong9568-663.workers.dev

## 현재 구현

- Workers Static Assets에서 `web/dist/`만 공개한다. Pages를 별도로 만들지 않고 웹과 API를 한 배포로 관리한다.
- Worker: `parkside-parking`, R2 binding: `RECORDS` → `parkside-driving-records`.
- R2 public development URL은 비활성이다. 기존 포트폴리오와 버킷을 공유하지 않는다.
- `operations/storage-check.json`은 수십 바이트의 고정 합성 파일이며 사용자 기록/학습 데이터가 아니다.
- `/api/health`는 위 파일을 실제 읽어 storage ready/unavailable을 반환한다. 임의 객체 조회는 지원하지 않는다.
- 실제 사용자 수집은 **미구현/비활성**이다. `/api/collection`은 enabled false, `/api/episodes` POST는 본문을 읽지 않고 503을 반환한다. 로컬 개발 API는 배포하지 않는다.
- 주행/센서/모델 추론은 브라우저에서 실행한다. 사용자 주행은 기존 로컬 IndexedDB에만 보관한다.
- 앱 요청 로그는 `observability.enabled=false`. 공급자 내부 보안/접속 로그까지 없다는 의미는 아니다.
- `/data-notice.html`에 실제 동작과 플랫폼 접속 처리, 시뮬레이션 한계를 안내한다.

## 재배포

저장소 루트, Node.js 22.12 이상. 공식 CLI의 기존 OAuth 로그인을 사용하며 토큰을 코드에 넣지 않는다.

```bash
npm --prefix web ci
npm --prefix web run test:cloudflare
npm --prefix web run build
npx --yes wrangler@4.132.0 deploy --dry-run
# 사용자 배포 승인 후 실행
npx --yes wrangler@4.132.0 deploy
```

GitHub 자동 배포는 연결하지 않았다. 검증한 로컬 빌드를 직접 배포한다.
기반 main commit은 `d84bb38`, 작업 브랜치는 `feature/13-cloudflare-data`다. 최초 배포는 커밋 전 로컬 빌드로 수행했으며 이 변경에 배포 설정과 수정 코드를 함께 기록한다.
최초 Worker version: `10b0e2bb-1750-4468-b87e-8aa721fbd4e0`.
AI 첫 로딩 수정 반영 version: `a0807025-a092-4a60-81c7-b6cf9b32abe1`.
최초 버전은 AI에도 8초 timeout을 사용했다. 수정 반영 버전은 AI 30초/수동 8초로 구분한다.
복구는 Cloudflare Deployments에서 실제 버전을 확인하고 직전 검증 버전으로 rollback한다.

## 확인 결과와 남은 점

최초 공개 확인: 홈페이지/안내/모델 weights 200, health 200(storage ready), collection false, episodes POST 503, 개발 API 404.
실제 공개 브라우저에서 초기 AI 다운로드 timeout 후 재시도로 learned live·속도·센서 변화 확인.
이를 반영해 첫 AI 로딩 예산을 늘리고 지연 응답 회귀 테스트를 추가한다.
수정 검증: 9초 지연 후 실제 AI 추론 시작과 수동 8초 timeout 회귀 2 tests 통과. Worker 3 tests, 웹 build, 문서 검사 통과.
최초 공개 관전 주행은 90초 timeout으로 종료됐으며 성공으로 보고하지 않는다.
실기기 iOS/Android, 다수 사용자/비용 부하, 성공 성능은 이 확인으로 검증됐다고 주장하지 않는다.

## 후속 데이터 수집

사용자는 회원가입/매회 기여 버튼 없이 비식별 주행을 자동 수집하는 방향을 선택했다.
이는 기존 선택 기여 문서에 대한 후속 설계 변경이며 아직 공개 수집으로 구현하지 않았다.
활성화 전 #13에서 전송 전 필드 최소화, 로그 연결/재식별 가능성, 서버 입력/크기/빈도/비용 제한,
보관 기간과 삭제·전송 끄기, 비공개 문의와 실제 처리 정책을 확정하고 관련 문서를 함께 갱신한다.
raw → 검증/정제 → 버전 데이터셋 → 기존 오프라인 학습 → 분리 평가 → 모델 승격은 #17과 연결한다.
R2 구독은 사용량에 따라 과금될 수 있다. 무료 운영·익명성·학습 성능 향상을 보장하지 않는다.
