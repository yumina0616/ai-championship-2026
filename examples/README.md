# 예시의 상태

[reverse-bay.v1.json](scenarios/reverse-bay.v1.json)은 [공통 계약 초안](../docs/contracts.md)을 논의하기 위한 합성 입력입니다. 실제 차량 제원이나 완성된 엔진 API가 아닙니다. 길이 4.4m 등의 값은 개발 fixture일 뿐 제조사 사양으로 사용하지 않습니다.

문서 CI는 JSON 문법만 확인합니다. 차체 충돌·도달 가능성·센서 정확성은 아직 검사하지 않습니다. 해당 검사는 계약·엔진 구현 Issue에서 추가합니다.

축은 지면 x-y, yaw=0은 +x, pose는 뒷차축 중심입니다. 목표 공간의 중심과 목표 차량 pose는 차체 중심/뒷차축 차이를 고려해 다릅니다. 단위와 시간·제어·평가 값은 확정 전 변경될 수 있습니다.

실행 기록은 실제 엔진이 생긴 후 정상/실패 fixture를 추가합니다. 학습 데이터나 실제 사용자의 기록을 만들어낸 것처럼 예시를 공개하지 않습니다.

[#3](https://github.com/yumina0616/ai-championship-2026/issues/3)에서 계약 확정과 함께 두 fixture를 더 추가했습니다. [invalid-overlap-start.v1.json](scenarios/invalid-overlap-start.v1.json)은 시작 footprint가 obstacle과 겹치는 잘못된 입력으로, `reset()`이 값 대신 `EngineError(start_overlap)`를 던져야 함을 보이는 예시입니다. [reverse-bay-straight.v1.json](episodes/reverse-bay-straight.v1.json)은 reset 1회 + 저속 직진 step 2회짜리 최소 Episode 조각이며, 수치는 실제 엔진 코드가 아니라 `docs/integration-spike.md`의 ROS2/Gazebo spike에서 실측한 bicycle model 계산값입니다. 두 파일 모두 TS 엔진이 아직 없어 손으로 계산한 기대값이며, 실행 가능한 자동 테스트는 아닙니다.
