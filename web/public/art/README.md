# Mr.Park 콘셉트 아트

`mrpark-concept.png`는 2026-09-18 이 프로젝트 디자인 대화에서 내장 이미지 생성 도구로 생성한 디자인 시안이다. 사용자가 승인한 방향은 사실적인 은색 자동차·콘크리트 주차장과 넥타이를 맨 귀여운 초보 운전 로봇의 대비다. 특정 자동차·캐릭터 사진을 입력하거나 복제하지 않았다.

프롬프트 요약: 고급 자동차 광고 조명, 은색 오리지널 소형 전기차, 콘크리트 차고, 상아색 외장·검은 유리 얼굴·민트색 눈·P 배지·작은 넥타이를 갖춘 초보 운전 로봇, 같은 공간의 접지 그림자, 16:9 구성. 기존 자동차 로고·영화/게임 캐릭터·워터마크·가짜 계기판 제외.

이 이미지는 제품의 디자인 콘셉트이며 실제 실행 결과나 학습 성능의 증거가 아니다. 이미지에 맞춘 코드 기반 3D 캐릭터는 `src/DesignObjects.tsx`에 별도로 구현했다. 차량 GLB의 출처·라이선스는 `public/models/NOTICE.md`를 따른다. 생성 이미지와 실제 브라우저 렌더링의 외형·품질은 다르다.

## 미스터팍 브랜드 필름

`mrpark-film.mp4`는 2026-09-19 위 콘셉트 이미지를 입력으로 생성했다. 사용자 주행 데이터·개인정보·실제 차량 영상은 입력하지 않았다. 생성 당시 공개 데모의 무료 할당량을 사용했으며 유료 결제·가입·워터마크 제거는 하지 않았다. 향후 무료 이용 가능 여부는 보장하지 않는다.

- 생성 도구: [ZeroGPU 공개 Wan 데모](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster)
- 기반 모델: [Wan2.2-I2V-A14B-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers), 모델 카드 Apache 2.0
- 가속 LoRA: Kijai/WanVideo_comfy의 `Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank128_bf16.safetensors`. [상위 I2V 모델](https://huggingface.co/lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v)은 Apache 2.0으로 명시한다. 모델 가중치·코드는 이 프로젝트에서 재배포하지 않는다.
- 설정: seed 42, randomize false, inference steps 6, high/low guidance 각각 1, 요청 길이 4초
- 원본: 832×480, 16fps, 4.0625초. 4K/실사 촬영 영상으로 표현하지 않는다.
- 후처리: FFmpeg로 루프 끝/시작 0.4초 교차 전환, H.264 CRF20·faststart·무음. 최종 약 3.69초, 566,353 bytes.
- 최종 SHA-256: `01a729c3bada3a26811c78b09f95abec7821c6e7c4367a659c5550609de580b7`

프롬프트:

```text
Single continuous premium automotive brand film. Preserve the exact cute white ceramic robot identity and silver car. Robot blinks illuminated cyan eyes, subtly tilts its head toward camera and gives a small friendly wave, natural tiny body shift. Slow controlled camera push-in and slight lateral dolly. Soft cool garage lighting gently reflects across polished ceramic and silver bodywork, restrained warm rim light, cinematic physically based materials, photoreal 3D animation, clean consistent background. Car remains stationary. No cuts, no text, no logos, no new objects. Smooth motion, settle at end.
```

Negative prompt:

```text
morphing, distortion, extra limbs, changed character, melted face, camera shake, text, watermark, harsh flash, rapid cuts, blurry, low quality
```

화면에는 **AI 생성 브랜드 필름 · 실제 주행 화면이 아니에요**라고 표시한다. 실제 정책의 성공·센서 성능·지속적인 학습을 입증하는 자료가 아니다. 의상/형태의 생성 오차가 있으며 브라우저 3D 로봇·차량과 정확히 같다고 주장하지 않는다. 공개 모델 라이선스와 별개로 최종 제출 시 이미지·영상의 권리 및 대회 생성형 AI 표기 조건을 함께 검토한다.

## 스크롤 배경 필름

`parking-scroll-film.mp4`는 같은 콘셉트 아트에서 **별도로** 생성한 카메라 이동 영상이다. 차량/로봇을 주행시키지 않고 카메라가 차 주변을 이동한다. 사용자가 아래/위로 스크롤하면 영상 시간을 정방향/역방향으로 탐색한다. 실제 3D 공간·센서 스캔·학습 정책의 결과가 아니다.

- 생성일: 2026-09-19, 위와 동일한 무료 Wan2.2 공개 데모·기반 모델·가속 LoRA
- 설정: seed 72, randomize false, inference steps 6, high/low guidance 각각 1, 요청 길이 5초
- 생성 원본: 832×480, 16fps, 5.0625초
- 보정: 공식 [Real-ESRGAN ncnn Vulkan v0.2.0](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/tag/v0.2.0)과 [공식 20220424 모델 번들](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0)의 `realesr-animevideov3`로 로컬 2배 업스케일. 3D 애니메이션 영상에 영상 전용 경량 모델을 적용했다. 원본에 없는 실제 물리 정보/세부를 복원했다고 주장하지 않는다.
- ncnn 실행 코드 MIT, 상위 [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE) BSD-3-Clause. 실행 파일·모델 가중치는 저장소/배포물에 포함하지 않는다.
- 후처리: FFmpeg의 motion-compensated interpolation으로 32fps, H.264 CRF20·모든 프레임 keyframe·faststart·무음. **1664×960은 AI 보정 해상도이며 네이티브 HD/4K 생성 또는 실사 촬영이 아니다.** 보간 프레임과 생성된 형태에 오차가 있을 수 있다.
- 최종: 1664×960, 32fps, 159프레임, 4.96875초, 8,241,817 bytes. SHA-256: `8900ac2b4364d28a7d47b97d2b55d569dd763c8ad12dc3cfed59b65c148b86fb`
- 공개 영상 업스케일 데모에는 생성된 이 필름만 제출했으나 무료 GPU 할당량 부족으로 실패했다. 최종 보정은 로컬에서 수행했으며 로그인·결제·사용자 주행 기록 전송은 없다.

프롬프트:

```text
Single continuous cinematic camera tracking shot through a premium concrete parking garage. The CAMERA makes a clearly visible smooth rightward dolly and forward push, passing the stationary small white robot and orbiting the stationary silver car from front three-quarter toward side view. Strong natural parallax: nearby floor parking lines move past the camera while distant concrete columns shift slowly. The camera rises slightly, revealing the surrounding empty parking bays. Preserve the silver car and robot identity and rigid geometry. Realistic dark charcoal concrete, soft daylight, brushed metal, understated automotive commercial atmosphere. No beams, no laser effects, no particles, no overlays, no titles, no logos. No cuts. No walking, no driving, no wheel motion. Steady fluid camera motion for the entire shot.
```

Negative prompt:

```text
morphing, melting car, warped wheels, extra limbs, dancing, walking, zoom only, static camera, shaky camera, sudden cuts, neon lasers, glow effects, text, logos, watermark, blurry, low quality
```

배경은 브랜드 장식으로만 사용한다. 밝은 차체 윤곽이 글씨와 경쟁하지 않도록 화면 전체를 잇는 수평 암부를 적용한다. 텍스트 주변의 둥근 음영·부분 매트는 사용하지 않는다. 동작 줄이기/네트워크 오류에서는 기존 콘셉트 포스터를 유지한다.
