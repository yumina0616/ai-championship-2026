# Mr.Park Cloudflare 공개 배포

2026-09-19, #13/#15. 사용자 도메인: https://mrpark.ai.kr

기존 주소 https://parkside-parking.jinhyeong9568-663.workers.dev 도 유지합니다. 가비아 도메인의 네임서버는 `opal.ns.cloudflare.com`, `rudy.ns.cloudflare.com`이며 Cloudflare Free zone과 기존 `parkside-parking` Worker의 Custom Domain을 사용합니다. 2026-09-19 공개 DNS와 HTTPS 200 응답을 확인했습니다. 지역별 DNS 캐시는 반영 시점이 다를 수 있습니다. `wrangler.jsonc`에 도메인을 고정해 재배포 때 대시보드 설정이 유실되지 않도록 합니다. 등록기관 이전·별도 호스팅 구매·R2 공개 설정은 필요하지 않습니다.

새 도메인은 기존 `workers.dev`와 다른 브라우저 출처입니다. 로컬 기록·전송 동의·삭제 영수증은 자동으로 이전되지 않습니다. 기존 서버 기록의 삭제는 원래 접속한 주소의 기록 설정에서 수행하고, 새 주소에서는 기록 방식을 다시 선택합니다. 임의로 기록을 복사하거나 동의를 승계하지 않습니다.

## 서비스명과 기존 식별자

서비스명은 **Mr.Park(미스터팍)**으로 확정했습니다. 브랜드 변경은 화면·문서·다운로드 파일명에 적용하며, 공개 화면에는 재배포 후 반영됩니다. Worker/R2 이름과 위 URL은 운영 중인 리소스를 그대로 사용하기 위해 유지합니다. `/api/health`의 내부 `service` 값, 데이터 schema/Scenario ID와 브라우저 저장 키의 `parkside`도 호환성을 위해 유지합니다. 이름만 바꾸기 위한 리소스 재생성이나 데이터 마이그레이션은 하지 않습니다.

## 현재 구현

2026-09-17 수집 후속: [수집 계약·운영·학습 인수인계](collection.md)를 추가했다. R2 `episodes/` 30일, `revoked/` 31일, `daily-limit/` 2일 만료 규칙을 실제 설정하고 확인했다. `wrangler.jsonc`에서 수집을 켜도 웹의 첫 선택은 OFF이며, 동의 후 새로 시작한 완료 기록만 전송한다. 실제 배포 반영 여부는 `/api/collection`을 확인한다. 아래 최초 배포 기록은 변경 전 이력이다.

- Workers Static Assets에서 `web/dist/`만 공개한다. Pages를 별도로 만들지 않고 웹과 API를 한 배포로 관리한다.
- Worker: `parkside-parking`, R2 binding: `RECORDS` → `parkside-driving-records`.
- R2 public development URL은 비활성이다. 기존 포트폴리오와 버킷을 공유하지 않는다.
- `operations/storage-check.json`은 수십 바이트의 고정 합성 파일이며 사용자 기록/학습 데이터가 아니다.
- `/api/health`는 위 파일을 실제 읽어 storage ready/unavailable을 반환한다. 임의 객체 조회는 지원하지 않는다.
- 실제 수집은 `/api/collection`의 enabled와 안내 버전이 맞을 때만 가능하다. `/api/episodes`는 동의 버전·삭제 영수증·입력·출처·크기·빈도·일일 접수 상한을 검사한다. 로컬 개발 API는 배포하지 않는다.
- 주행/센서/모델 추론은 브라우저에서 실행한다. 기본 기록은 로컬 IndexedDB이며, 학습용 전송을 켜면 완료 후 정리한 기록만 비공개 R2에도 저장한다.
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
Mr.Park 브랜드·선택형 수집 반영 version: `b0d9b4c5-b363-4134-95de-c8ac6a9f0d48` (2026-09-17, `feature/13-record-ingestion` 작업본). 현재 policy artifact는 기존 그대로다.
최초 버전은 AI에도 8초 timeout을 사용했다. 수정 반영 버전은 AI 30초/수동 8초로 구분한다.
복구는 Cloudflare Deployments에서 실제 버전을 확인하고 직전 검증 버전으로 rollback한다.

## 확인 결과와 남은 점

2026-09-19 디자인·주행 UX 배포:

- 코드 커밋: `39c5308`, 브랜치: `feature/12-mrpark-art-direction` (main 병합과 별개로 사용자 승인 후 직접 배포).
- Worker version: `29934df1-03cd-44b4-9b80-ca11ac3a3280`.
- 새 도메인과 기존 주소 모두 홈페이지 200 및 로컬 배포 빌드 HTML 일치, health `storage: ready`, collection `enabled: true` 확인.
- 영상 2개·차량 GLB·폰트·안내·출처 페이지 200 및 올바른 Content-Type 확인. 새 도메인의 실제 브라우저에서 고화질 3D 랜딩 렌더링 확인.
- 새 설치 후 엔진 타입 검사/65 tests, Worker·수집 8 tests, 로컬 API 3 tests, Python 7 tests, 문서 검사 및 웹 빌드 통과. 프로덕션 artifact 브라우저 검사 1 test 통과(학습 가중치 추론·로컬 기록·동의 없는 POST 없음).
- Three.js/학습 런타임의 500 kB 초과 chunk 경고는 남아 있습니다. 이번 검증은 실기기 전체 성능·실제 사용자 기록 수집 검증을 대신하지 않습니다. 사용자 원본 데이터를 조회하거나 시험 업로드하지 않았습니다.

수집 공개 검증: `/api/collection` enabled true/안내 버전/30일/문의 주소 확인, health storage ready/collection enabled. 실제 1,801-step(90초) 합성 기록 7,028,089 bytes POST 201, 같은 삭제 capability 재전송 200, DELETE 200 확인. 테스트 원본은 삭제했으며 개인정보나 실제 사용자 기록을 검증용으로 사용하지 않았다. 만료 규칙은 CLI로 읽어 확인했다. 일일 접수 슬롯·삭제 tombstone만 각 만료일까지 남는다.

관리용 `COLLECTION_ADMIN_TOKEN`은 아직 발급/설정하지 않아 export API는 401로 닫혀 있다. 실제 데이터 검토를 시작할 때 운영자와 팀원이 비공개로 키를 설정하고 [수집 안내](collection.md)의 export→review→prepare→후보 학습→compare를 실행한다. 이를 공개 사용자 인증으로 사용하지 않는다.

최초 공개 확인: 홈페이지/안내/모델 weights 200, health 200(storage ready), collection false, episodes POST 503, 개발 API 404.
실제 공개 브라우저에서 초기 AI 다운로드 timeout 후 재시도로 learned live·속도·센서 변화 확인.
이를 반영해 첫 AI 로딩 예산을 늘리고 지연 응답 회귀 테스트를 추가한다.
수정 검증: 9초 지연 후 실제 AI 추론 시작과 수동 8초 timeout 회귀 2 tests 통과. Worker 3 tests, 웹 build, 문서 검사 통과.
최초 공개 관전 주행은 90초 timeout으로 종료됐으며 성공으로 보고하지 않는다.
실기기 iOS/Android, 다수 사용자/비용 부하, 성공 성능은 이 확인으로 검증됐다고 주장하지 않는다.

## 후속 데이터 수집

사용자는 회원가입/매회 기여 버튼 없이 처음 한 번 선택한 뒤 완료 주행을 자동 전송하기로 확정했다.
#13에 전송 전 필드 최소화, 서버 입력/크기/빈도/전역 일일 접수 제한, 보관·삭제·전송 끄기를 추가했다.
문의 주소는 `jinhyeong9568@gmail.com`이며 완전 익명이나 실차 적용 가능성을 보장하지 않는다.
raw → 검증/정제 → 버전 데이터셋 → 기존 오프라인 학습 → 분리 평가 → 모델 승격은 #17과 연결한다.
R2 구독은 사용량에 따라 과금될 수 있다. 무료 운영·익명성·학습 성능 향상을 보장하지 않는다.
