# Mr.Park 수집 → 오프라인 학습 인수인계

관련 #13(JH-9568), #17(yumina0616). 2026-09-17 사용자 결정: 로그인 없이 **처음 한 번 선택 후 다음 주행부터 자동 전송**. 실제 공개 활성화 상태는 `/api/collection`에서 확인한다. 코드 구현과 운영 활성화, 데이터 축적과 모델 개선은 서로 다르다.

## 수집 계약

- `web/src/collection-record.ts`: `mr-park-record.v1`, 안내 `mr-park-learning-2026-09-17.v1`.
- 로컬 `parkside-episode.v1`을 유지한다. 원본 ID·실제 시각·동의 필드 대신 업로드용 안내 버전을 붙인다. 맵 이름을 보내지 않고 custom 장애물 ID를 종류/순번으로 바꾼다. 이전 step 관측과 sim time은 복원 가능하므로 중복 전송하지 않는다. 센서·요청/적용 command·다음 상태·시점/도움·종료는 보존한다.
- 웹과 서버 모두 기존 Episode parser로 검증한다. 서버는 whitelist로 재구성한 값만 저장한다. 8 MiB 요청, 1,801 step, 36-ray 상한. 최대 크기는 브라우저에서도 검사한다. 인증 정보·쿠키는 전송하지 않는다.
- 기록 보관을 켜고 동의한 상태로 **시작한** 주행의 완료 시점에만 POST한다. 선택 전 과거 기록/파일 재생/탭 종료/불완전 기록은 제외한다. 실패·충돌·사용자 중단도 분석 자료이며 성공만 수집하지 않는다.
- 기본 OFF, 안내 버전 일치 시에만 이전 선택 복원. 전송 끄기를 다른 탭에도 반영한다. 저장소/Web Locks 사용 불가 시 업로드하지 않는다. 로컬 연습은 계속 가능하다.
- API에 동의 버전이 있다고 인간의 동의나 인간 운전을 증명하는 것은 아니다. 봇/조작 데이터는 후속 정제에서 배제한다.

## API·권한·운영

| API | 계약 |
| --- | --- |
| `GET /api/collection` | 활성화 여부·안내 버전·30일 보관·문의 주소 |
| `POST /api/episodes` | 동일 Origin, JSON, 매 기록 256-bit 삭제 capability를 Authorization Bearer에 전달. 성공 201, 중복 200, 거부 400/403/410/415/429/503 |
| `DELETE /api/episodes` | 동일 Origin·해당 capability. 먼저 tombstone, 다음 원본 삭제. 수집 OFF여도 삭제는 유지 |
| `GET /api/admin/records?cursor=...` | 별도 Worker secret `COLLECTION_ADMIN_TOKEN` 필요, 25개 키씩 조회 |
| `GET /api/admin/records/<sha256>` | 같은 운영자 권한으로 원본 추출. tombstone이 있으면 404 |

원본은 `episodes/<sha256(capability)>.json`, 삭제 차단은 `revoked/<sha256>.json`. 기록 간 공통 사용자 ID는 없다. 원본은 비공개 R2, 공개 조회 없음. capability 원문은 브라우저에만 보관하며 삭제 영수증으로 취급한다. 먼저 영수증을 저장한 뒤 전송해서 응답 유실에도 삭제 권한을 남긴다. 전송은 20초 timeout, 자동 재시도 없음. 삭제 실패 시 영수증을 버리지 않는다. 브라우저 삭제/다른 도메인 이동 전 서버 삭제를 권한다.

`UPLOAD_LIMIT` IP별 10회/60초, `GLOBAL_LIMIT` 고정 key 100회/60초. [Cloudflare 네이티브 제한](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)은 위치별 best-effort이므로 전세계 비용의 절대 상한이 아니다. 별도로 R2 조건부 쓰기 `daily-limit/<UTC 날짜>/<0..199>.json`으로 전세계 신규 접수를 하루 최대 200개로 막는다. 실패/동시 충돌 시 실제 접수량은 더 적을 수 있으며 quota 초과에는 429다. 슬롯은 2일 후 만료한다. 네트워크 요청/플랫폼 비용까지 0으로 보장하는 장치는 아니다. IP는 제한에만 쓰고 R2 기록/앱 로그에 저장하지 않는다. 플랫폼 자체 접속 처리까지 없어지는 것은 아니다. 남용 시 수집 flag를 OFF로 재배포하고 비용·제한을 검토한다. 유료 플랜 전환은 별도 승인한다.

원본 prefix는 30일, tombstone prefix는 31일 lifecycle. [R2 만료](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)는 비동기라 물리 삭제가 지연될 수 있다. export는 30일 지난 기록을 제외한다. 운영자 로컬 원본/정제 사본도 같은 원본 만료일까지 지우며, 이미 생성한 모델에서 즉시 특정 기록 영향을 제거한다고 약속하지 않는다. 문의: `jinhyeong9568@gmail.com`.

## 나중에 데이터가 쌓이면

서버 상시 학습·GPU 서버·자동 모델 교체는 만들지 않았다. 팀원은 기존 TF.js 학습 코드를 사용한다. 공개 모델 파일은 이 작업으로 바꾸지 않는다.

1. 운영자가 Worker secret `COLLECTION_ADMIN_TOKEN`을 안전하게 설정하고 같은 값을 운영자 환경변수에 주입한다. 브라우저 변수(`VITE_*`), Git, 공유 로그에 넣지 않는다. 미설정이면 관리 API는 닫혀 있다.
2. `MR_PARK_URL`에 공개 HTTPS 주소를 설정한다. 아래 경로는 `training/` 기준이며 새 폴더만 사용한다.

```bash
cd training
npm run community -- export data/raw-20260920
```

3. 팀원이 원본을 비공개로 검토하고 `data/review.json`을 작성한다. 한 행 예시:

```json
[{"id":"원본 manifest의 64자리 id","split":"train","observationReviewed":true,"layoutGroup":"layout-family-a"}]
```

`split`은 train/validation/heldout 중 하나다. 같은 장애물 레이아웃은 시작점·목표·seed만 바꿔도 같은 분할에 둔다. 근소하게 이동한 유사 맵도 팀원이 같은 `layoutGroup`으로 묶는다. 고정 템플릿의 많은 반복은 새로운 평가 맵 수가 아니다. 기존 모델의 학습·validation 레이아웃과 새로운 heldout의 독립성도 팀원이 확인한다.

```bash
npm run community -- prepare data/raw-20260920 data/review.json data/dataset-20260920
npm run train -- data/dataset-20260920 data/candidate-20260920
npm run community -- compare data/dataset-20260920 model data/candidate-20260920 data/comparison-20260920.json
```

- export는 운영자만 내려받고 checksum manifest를 만든다. prepare 직전 24시간 이내에 새로 export하여 삭제·만료를 반영한다. 다운로드는 snapshot isolation이 아니므로 학습 직전 삭제 요청/운영자 사본 처리도 검토한다.
- prepare는 같은 엔진으로 센서·행동·충돌·종료를 재계산한다. 중복 trajectory, checksum 오류, 안내 버전 오류, 동일 레이아웃의 분할 누출은 거부한다.
- 행동복제는 성공한 human 기록 + 완전 로그 + 관측 가능성 수동 검토만 허용한다. top/orbit 시점 기록은 자동 제외한다. follow에서도 HUD/도움의 정보 차이를 검토해야 하며 성공이라고 무조건 정답 라벨은 아니다.
- 실패·learned 기록은 원본 분석/평가 맵 후보로 남기되 정답 행동 라벨로 넣지 않는다. 데이터가 부족하면 prepare가 중단된다. 정상 동작이다.
- train은 새 후보 폴더만 허용하고 dataset checksum·lineage를 기록한다. 기존 `training/model/`을 덮어쓰지 않는다.
- compare는 동일 heldout에서 기존/후보를 모두 실행하고 전체 실패를 보고한다. 10개 이상 서로 다른 평가 레이아웃, 성공 증가, 충돌 비증가, 불완전/오류 없음일 때만 `eligibleForReview=true`. 통계적 유의성 또는 실차 성능 증명은 아니다.
- **후보 배포는 자동이 아니다.** yumina0616이 평가·지원 규격을 검토한 뒤 새 policy version/체크섬/manifest를 만들고, JH-9568이 `policy-info.ts`·모델 로딩·기록 parser의 구버전 호환과 테스트를 갱신하는 별도 PR로 반영한다. 이전 artifact와 배포 버전은 rollback용으로 보존한다.

## 검증과 남는 범위

`npm --prefix web run test:cloudflare`, `npm --prefix web test -- tests/collection.spec.ts tests/privacy.spec.ts`, `npm --prefix training run typecheck`, `npm --prefix training test`.
합성 기록으로 저장·중복·타인 접근·삭제·과대/형식/빈도 차단·무동의 업로드 없음·데이터 누출·악화 후보 차단을 검증한다. 실제 사용자 규모·실기기·공격 부하·학습 개선은 별도 검증이다. 30일 로컬 사본 운영, 후보 모델의 버전 승격과 과거 기록 호환은 팀원 검토 없이 완료 처리하지 않는다.
