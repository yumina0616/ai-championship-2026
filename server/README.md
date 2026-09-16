# 로컬 합성 기록 기여 테스트 API

#13의 배포 전 검증용입니다. **실제 사용자 Episode 업로드는 지원하지 않습니다.** 외부 서버·DB 계정·결제·클라우드를 만들지 않습니다. 공개 배포나 실제 수집 전에 별도 운영/보관 정책을 팀이 결정해야 하므로 #13은 아직 완료가 아닙니다.

## 실행

Node.js 22.12 이상, 저장소 루트에서:

```bash
npm --prefix web ci
npm --prefix web run test:local-api
PARKSIDE_LOCAL_CONTRIBUTIONS=1 npm --prefix web run dev:local-api
```

다른 터미널에서 `npm --prefix web run dev`를 실행하고 차고의 **개발 전용 기여 테스트**를 펼칩니다. 「로컬 API 확인」 → 기본 해제된 합성 테스트 동의 → 저장 → 내 기록 확인 → 철회/삭제를 검사합니다. Vite가 `/api/local-contributions`를 `127.0.0.1:8787`로 프록시합니다. 이 UI는 production 빌드에서 제거됩니다. 환경변수 없이 API를 실행하면 쓰기는 503으로 거부됩니다.

## 받는 입력과 보관

`POST /api/local-contributions`는 `{fixture:"stationary.v1", consent:true, consentVersion:"local-synthetic.v1"}`만 받습니다. 서버가 같은 웹/엔진 계약으로 정지 5-step 합성 Episode를 만들고 `parseEpisode`로 검증합니다. `episode` 등의 추가 필드를 보내면 거부합니다. 브라우저의 기존 기록은 전송하지 않습니다.

저장소는 **개발 PC의 `server/.local-data/` 로컬 JSON 파일**입니다. 폴더 0700·파일 0600, 최대 20개, 테스트 보관 기간 1시간입니다. 이 1시간은 합성 테스트의 정리 기준이지 실제 사용자 데이터 보관 정책을 결정한 것이 아닙니다. 만료 기록은 API 접근 때와 가동 중 1분 간격으로 삭제합니다. 서버가 꺼져 있으면 다시 실행할 때까지 파일이 남습니다. 일반 Git에서는 제외하며 백업/로그 수집은 구성하지 않았습니다. 보안 삭제/디스크 복구 불가능성을 보장하지 않습니다.

합성 원본의 Episode consent는 `not_requested`로 유지하고 테스트 요청의 동의 version/time을 별도 envelope에 저장합니다. 실제 사용자의 학습 기여 동의로 재해석하거나 학습 데이터에 넣지 않습니다.

## 권한과 제한

- listen은 `127.0.0.1:8787`만 사용합니다. Host/Origin allowlist, 명시적 `X-Parkside-Test: 1`, JSON Content-Type, 1 KiB 요청 상한, 분당 60요청(로컬 서버 전체), 연결 20개·요청 5초 제한이 있습니다.
- 생성 응답에 UUID와 256-bit 권한 토큰을 한 번 반환합니다. 토큰 원문은 파일/URL에 저장하지 않고 SHA-256만 보관합니다. ID만으로 읽거나 지울 수 없습니다.
- `GET/DELETE /api/local-contributions/<id>`에 `Authorization: Bearer <token>`이 필요합니다. 다른 기록 토큰·없는 기록·만료는 모두 404입니다. 목록/공개 기록 API는 없습니다. 모든 응답은 `no-store`입니다.
- 삭제는 원본 파일을 제거하며 테스트 UI는 토큰을 탭 메모리에만 보관합니다. 새로고침으로 토큰을 잃으면 만료를 기다립니다. 실제 서비스라면 삭제 영수증 복구/안내와 운영 절차를 추가 결정해야 합니다.
- 이 API는 **로컬 테스트용**입니다. 인증된 다중 사용자 서비스, TLS, reverse proxy 운영 설정, 분산 rate limit, 감사/백업 정책을 구현했다고 주장하지 않습니다.

## 검증과 다음 결정

`npm --prefix web run test:local-api`는 실제 loopback HTTP로 기본 비활성/동의/허용 필드·교차 Origin/Host·권한 분리·조회·삭제·만료·크기/빈도/보관 한도를 검사합니다. 각 테스트는 별도 임시 폴더를 만들고 자기 폴더만 정리합니다. 웹 `contribution.spec.ts`는 API 대역으로 동의 UI와 요청 범위를 검사하며 이 서버 통합 검사의 대체물이 아닙니다.

실제 수집 전 결정할 것: 저장소/호스팅·예산, 공개된 목적/필드/보관 기간, 익명 삭제/영수증 UX, 동의 철회와 미래 학습 snapshot 제외, 이미 배포한 모델에서 즉시 학습 제거를 보장할 수 없다는 안내, 접근 권한·삭제/백업 운영, 실제 데이터용 서버 검증. 결정 전에는 사용자 업로드를 계속 비활성화합니다.
