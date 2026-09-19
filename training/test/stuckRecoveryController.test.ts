import { describe, expect, it } from "vitest";
import { wrapWithStuckRecovery, DEFAULT_STUCK_RECOVERY_OPTIONS } from "../src/stuckRecoveryController";
import type { Command, Observation, Pose } from "../../engine/src/index";

const ZERO_CMD: Command = { targetSpeedMps: 0, targetSteeringRad: 0 };
const MOVE: Command = { targetSpeedMps: 0.5, targetSteeringRad: 0 };
const FAR_OBS = { goalRelative: { xM: 5, yM: 0, yawRad: 0 } } as Observation;

function poseAt(xM: number): Pose {
  return { xM, yM: 0, yawRad: 0 };
}
function obsAtDistance(distanceM: number): Observation {
  return { goalRelative: { xM: distanceM, yM: 0, yawRad: 0 } } as Observation;
}

describe("wrapWithStuckRecovery (실제 이동 거리 기반)", () => {
  it("차량이 계속 실제로 이동하면(회전 기동 등으로 목표 직선거리는 안 줄어도) 재계획을 트리거하지 않는다", () => {
    let replanCalls = 0;
    const controller = wrapWithStuckRecovery(
      () => MOVE,
      () => {
        replanCalls++;
        return [MOVE];
      },
      { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 }
    );
    for (let i = 0; i < 30; i++) controller(FAR_OBS, poseAt(i * 0.1), ZERO_CMD); // 스텝마다 0.1m씩 실제 이동
    expect(replanCalls).toBe(0);
  });

  it("차량이 창 동안 제자리에 거의 그대로면(정체) 재계획을 트리거한다", () => {
    let replanCalls = 0;
    const kickCommand: Command = { targetSpeedMps: 0.3, targetSteeringRad: 0.1 };
    const controller = wrapWithStuckRecovery(
      () => MOVE,
      () => {
        replanCalls++;
        return [kickCommand, kickCommand];
      },
      { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 }
    );
    let triggeredCommand: Command | null = null;
    for (let i = 0; i < 15; i++) {
      const cmd = controller(FAR_OBS, poseAt(i * 0.001), ZERO_CMD); // 거의 안 움직임
      if (cmd === kickCommand) triggeredCommand = cmd;
    }
    expect(replanCalls).toBeGreaterThan(0);
    expect(triggeredCommand).toBe(kickCommand);
  });

  it("목표에 가까우면(ignoreWithinM 이내) 제자리에 있어도 트리거하지 않는다 — 정상 정지 오판 방지", () => {
    let replanCalls = 0;
    const controller = wrapWithStuckRecovery(
      () => ZERO_CMD,
      () => {
        replanCalls++;
        return [MOVE];
      },
      { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 }
    );
    for (let i = 0; i < 30; i++) controller(obsAtDistance(0.3), poseAt(0), ZERO_CMD); // 목표 0.3m 이내, 정지
    expect(replanCalls).toBe(0);
  });

  it("재계획이 실패(null)하면 원래 정책 명령으로 대체한다", () => {
    const controller = wrapWithStuckRecovery(() => MOVE, () => null, { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 });
    let lastResult: Command | undefined;
    for (let i = 0; i < 15; i++) lastResult = controller(FAR_OBS, poseAt(i * 0.001), ZERO_CMD);
    expect(lastResult).toBe(MOVE);
  });

  it("킥 이후엔 기록이 초기화돼 곧바로 다시 트리거되지 않는다", () => {
    let replanCalls = 0;
    const controller = wrapWithStuckRecovery(
      () => MOVE,
      () => {
        replanCalls++;
        return [{ targetSpeedMps: 0.1, targetSteeringRad: 0 }];
      },
      { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 }
    );
    for (let i = 0; i < 12; i++) controller(FAR_OBS, poseAt(i * 0.001), ZERO_CMD);
    expect(replanCalls).toBe(1);
  });

  it("킥 큐가 여러 스텝이면 전부 소비할 때까지 재계획을 다시 안 부른다", () => {
    let replanCalls = 0;
    const controller = wrapWithStuckRecovery(
      () => MOVE,
      () => {
        replanCalls++;
        return [
          { targetSpeedMps: 0.1, targetSteeringRad: 0 },
          { targetSpeedMps: 0.2, targetSteeringRad: 0 },
          { targetSpeedMps: 0.3, targetSteeringRad: 0 },
        ];
      },
      { windowSteps: 10, minDisplacementM: 0.2, ignoreWithinM: 1 }
    );
    for (let i = 0; i < 10; i++) controller(FAR_OBS, poseAt(i * 0.001), ZERO_CMD);
    // 창이 다 찬 직후 트리거되어 3개짜리 큐가 생김 -> 그 이후엔 큐만 소비, 재계획 호출 없음.
    for (let i = 0; i < 2; i++) controller(FAR_OBS, poseAt(0.01), ZERO_CMD);
    expect(replanCalls).toBe(1);
  });

  it("기본 옵션값이 합리적인 범위다", () => {
    expect(DEFAULT_STUCK_RECOVERY_OPTIONS.windowSteps).toBeGreaterThan(0);
    expect(DEFAULT_STUCK_RECOVERY_OPTIONS.minDisplacementM).toBeGreaterThan(0);
    expect(DEFAULT_STUCK_RECOVERY_OPTIONS.ignoreWithinM).toBeGreaterThan(0);
    expect(DEFAULT_STUCK_RECOVERY_OPTIONS.kickSteps).toBeGreaterThan(0);
  });
});
