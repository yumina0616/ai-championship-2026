import {
  FIXED_DT_S,
  type Command,
  type Episode,
  type EpisodeStep,
  type Observation,
  type Pose,
  type Scenario,
  type StepResult,
} from "../../engine/src/index";
import { makeScenario } from "./driving";
import { mapScenario, parseMap } from "./maps";
import type { DriverInput, Gear } from "./driver-controls";
import { POLICY_VERSION } from "./policy-info";

export const EPISODE_BYTES = 16 * 1024 * 1024;
export interface DrivingContext {
  viewMode: string;
  assistanceFlags: string[];
}
export interface RawInput extends DrivingContext {
  gear: Gear;
  inputs: DriverInput[];
  analogSteer: number | null;
}
export interface RecordedStep extends EpisodeStep {
  nextObservation: Observation;
  rawInput: RawInput;
}
export interface LocalEpisode extends Omit<Episode, "steps" | "footer"> {
  initial: StepResult;
  steps: RecordedStep[];
  footer: Omit<Episode["footer"], "terminationReason"> & {
    terminationReason:
      | Episode["footer"]["terminationReason"]
      | "engine_error"
      | "policy_error";
  };
}
export const contextFlags = [
  "parking-status",
  "sensor-clearance",
  "sensor-rays",
  "grid",
  "reverse-guide",
  "steering-return",
  "sensor-sound",
  "spectator",
];
export function beginEpisode(
  scenario: Scenario,
  initial: StepResult,
  context: DrivingContext,
  policyVersion: string | null = null,
): LocalEpisode {
  if (policyVersion !== null && policyVersion !== POLICY_VERSION)
    throw Error("지원하지 않는 정책 버전이에요.");
  return {
    header: {
      episodeId: crypto.randomUUID(),
      schemaVersion: "parkside-episode.v1",
      scenarioSnapshot: structuredClone(scenario),
      scenarioVersion: scenario.scenarioId,
      engineVersion: "browser-kinematic-ts.v1",
      seed: scenario.seed ?? 0,
      controllerKind: policyVersion ? "learned" : "human",
      policyVersion,
      startedAt: new Date().toISOString(),
      consent: { status: "not_requested", version: null },
      viewMode: context.viewMode,
      assistanceFlags: [...context.assistanceFlags],
      metadata: { plannerUsesTruth: false },
    },
    initial: structuredClone(initial),
    steps: [],
    footer: {
      terminationReason: "incomplete",
      totalSimTimeS: 0,
      distanceTraveledM: 0,
      directionChanges: 0,
      collided: false,
      finalPositionErrorM: null,
      finalYawErrorRad: null,
      success: false,
      logComplete: false,
    },
  };
}
export function appendStep(
  episode: LocalEpisode,
  before: StepResult,
  command: Command,
  after: StepResult,
  input: RawInput,
) {
  if (episode.steps.length >= 1801) throw Error("기록 step 상한을 초과했어요.");
  episode.steps.push(
    structuredClone({
      stepIndex: episode.steps.length,
      simTimeS: after.simTimeS,
      observationT: before.observation,
      requestedActionT: command,
      appliedCommandT: after.appliedCommand,
      nextStateTruth: after.poseTruth,
      nextOutcome: after.outcome,
      nextObservation: after.observation,
      wallTimestamp: new Date().toISOString(),
      rawInput: input,
    }),
  );
}
export function episodeFooter(
  e: LocalEpisode,
  reason: LocalEpisode["footer"]["terminationReason"],
): LocalEpisode["footer"] {
  let pose = e.initial.poseTruth,
    distance = 0,
    direction = 0,
    changes = 0;
  for (const step of e.steps) {
    distance += Math.hypot(
      step.nextStateTruth.xM - pose.xM,
      step.nextStateTruth.yM - pose.yM,
    );
    pose = step.nextStateTruth;
    const next = Math.sign(step.appliedCommandT.targetSpeedMps);
    if (next && direction && next !== direction) changes++;
    if (next) direction = next;
  }
  const last = e.steps.at(-1),
    goal = (last?.nextObservation ?? e.initial.observation).goalRelative;
  return {
    terminationReason: reason,
    totalSimTimeS: last?.simTimeS ?? 0,
    distanceTraveledM: distance,
    directionChanges: changes,
    collided: reason === "collision",
    finalPositionErrorM: Math.hypot(goal.xM, goal.yM),
    finalYawErrorRad: Math.abs(goal.yawRad),
    success: reason === "success",
    logComplete: !["incomplete", "engine_error", "policy_error"].includes(
      String(reason),
    ),
  };
}
export function finishEpisode(
  e: LocalEpisode,
  reason: LocalEpisode["footer"]["terminationReason"],
): LocalEpisode {
  return structuredClone({ ...e, footer: episodeFooter(e, reason) });
}
export function recordedFrame(e: LocalEpisode, index: number): StepResult {
  const s = e.steps[index - 1];
  return s
    ? {
        poseTruth: s.nextStateTruth,
        observation: s.nextObservation,
        simTimeS: s.simTimeS,
        appliedCommand: s.appliedCommandT,
        outcome: s.nextOutcome,
      }
    : e.initial;
}
const fail = () => {
  throw Error(
    "손상되었거나 지원하지 않는 기록이에요. 버전·step·센서·종료 정보를 확인해주세요.",
  );
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail();
const num = (v: unknown, min = -1e4, max = 1e4): number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail();
function equal(a: unknown, b: unknown): boolean {
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    const ak = Object.keys(a),
      bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every(
        (k) =>
          Object.hasOwn(b, k) &&
          equal(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
          ),
      )
    );
  }
  return Object.is(a, b);
}

export function comparisonError(
  a: LocalEpisode,
  b: LocalEpisode,
): string | null {
  if (a.header.episodeId === b.header.episodeId)
    return "서로 다른 두 기록을 선택해주세요.";
  if (
    a.header.engineVersion !== b.header.engineVersion ||
    a.header.scenarioVersion !== b.header.scenarioVersion ||
    a.header.seed !== b.header.seed ||
    !equal(a.header.scenarioSnapshot, b.header.scenarioSnapshot) ||
    !equal(a.initial, b.initial)
  )
    return "환경·차량·센서·평가·seed 또는 초기 상태가 달라 경로 비교를 할 수 없어요.";
  return null;
}
function readPose(v: unknown): Pose {
  const p = obj(v);
  return {
    xM: num(p.xM, -40, 40),
    yM: num(p.yM, -40, 40),
    yawRad: num(p.yawRad, -Math.PI, Math.PI),
  };
}
function readCommand(v: unknown): Command {
  const c = obj(v);
  return {
    targetSpeedMps: num(c.targetSpeedMps, -1, 1.5),
    targetSteeringRad: num(c.targetSteeringRad, -0.55, 0.55),
  };
}
function observation(v: unknown, time: number): Observation {
  const o = obj(v);
  if (!Array.isArray(o.sensors) || o.sensors.length !== 36) return fail();
  return {
    speedMps: num(o.speedMps, -1, 1.5),
    steeringRad: num(o.steeringRad, -0.55, 0.55),
    goalRelative: readPose(o.goalRelative),
    sensors: o.sensors.map((value, i) => {
      const r = obj(value),
        angle = num(r.angleRad, -Math.PI, Math.PI),
        updated = num(r.updatedSimTimeS, 0, time + 1e-6);
      if (
        Math.abs(angle - (-Math.PI + (i * Math.PI) / 18)) > 1e-6 ||
        typeof r.valid !== "boolean" ||
        (!r.valid && r.rangeM !== null)
      )
        return fail();
      return {
        angleRad: angle,
        updatedSimTimeS: updated,
        valid: r.valid,
        rangeM: r.valid ? num(r.rangeM, 0, 10) : NaN,
      };
    }),
  };
}
function outcome(v: unknown) {
  const o = obj(v);
  if (
    typeof o.terminated !== "boolean" ||
    !(
      o.reason === null ||
      ["success", "collision", "timeout", "user_abort"].includes(
        String(o.reason),
      )
    ) ||
    o.terminated !== (o.reason !== null)
  )
    return fail();
  return {
    terminated: o.terminated,
    reason: o.reason as StepResult["outcome"]["reason"],
  };
}
function context(v: unknown): DrivingContext {
  const r = obj(v);
  if (
    !["orbit", "follow", "top", "rear"].includes(String(r.viewMode)) ||
    !Array.isArray(r.assistanceFlags) ||
    r.assistanceFlags.length > contextFlags.length ||
    !r.assistanceFlags.every((f) => contextFlags.includes(String(f)))
  )
    return fail();
  return {
    viewMode: String(r.viewMode),
    assistanceFlags: r.assistanceFlags as string[],
  };
}
function timestamp(v: unknown): string {
  if (typeof v !== "string" || v.length > 32 || !Number.isFinite(Date.parse(v)))
    return fail();
  return v;
}
export function parseEpisode(text: string): LocalEpisode {
  if (new TextEncoder().encode(text).length > EPISODE_BYTES)
    throw Error("기록 파일은 16 MB 이하여야 해요.");
  const r = obj(JSON.parse(text)),
    h = obj(r.header),
    rawScenario = obj(h.scenarioSnapshot);
  // 지원 구성만 복원한다. 임의 센서 수·엔진 설정을 가져와 실행하지 않는다.
  let scenario: Scenario | undefined;
  for (const t of ["open", "neighbors", "pillar"] as const) {
    const preset = makeScenario(t);
    if (equal(preset, rawScenario)) scenario = preset;
  }
  if (!scenario) {
    const map = parseMap(
      JSON.stringify({
        version: "parkside-map.v1",
        name: "기록 맵",
        start: rawScenario.start,
        goal: rawScenario.goalSpace,
        obstacles: rawScenario.obstacles,
      }),
    );
    const custom = mapScenario(map);
    if (!equal(custom, rawScenario)) return fail();
    scenario = custom;
  }
  if (
    h.schemaVersion !== "parkside-episode.v1" ||
    h.engineVersion !== "browser-kinematic-ts.v1" ||
    h.scenarioVersion !== scenario.scenarioId ||
    h.seed !== (scenario.seed ?? 0) ||
    !(
      (h.controllerKind === "human" && h.policyVersion === null) ||
      (h.controllerKind === "learned" && h.policyVersion === POLICY_VERSION)
    ) ||
    !equal(h.consent, { status: "not_requested", version: null }) ||
    !equal(h.metadata, { plannerUsesTruth: false }) ||
    typeof h.episodeId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(h.episodeId)
  )
    return fail();
  const init = obj(r.initial),
    initial: StepResult = {
      poseTruth: readPose(init.poseTruth),
      observation: observation(init.observation, 0),
      simTimeS: num(init.simTimeS, 0, 0),
      appliedCommand: readCommand(init.appliedCommand),
      outcome: outcome(init.outcome),
    };
  if (!equal(initial.poseTruth, scenario.start) || initial.outcome.terminated)
    return fail();
  const e = beginEpisode(
    scenario,
    initial,
    context(h),
    h.policyVersion as string | null,
  );
  e.header.episodeId = h.episodeId;
  e.header.startedAt = timestamp(h.startedAt);
  if (!Array.isArray(r.steps) || r.steps.length > 1801) return fail();
  let previous = initial;
  for (let i = 0; i < r.steps.length; i++) {
    const s = obj(r.steps[i]),
      time = num(s.simTimeS, 0, 91),
      raw = obj(s.rawInput);
    if (
      s.stepIndex !== i ||
      Math.abs(time - (i + 1) * FIXED_DT_S) > 1e-6 ||
      previous.outcome.terminated
    )
      return fail();
    if (
      !["P", "R", "D"].includes(String(raw.gear)) ||
      !Array.isArray(raw.inputs) ||
      raw.inputs.length > 4 ||
      !raw.inputs.every((k) =>
        ["throttle", "brake", "left", "right"].includes(String(k)),
      )
    )
      return fail();
    if (
      h.controllerKind === "learned" &&
      (raw.inputs.length !== 0 || raw.analogSteer !== null)
    )
      return fail();
    const obs = observation(s.observationT, previous.simTimeS),
      next = observation(s.nextObservation, time);
    if (!equal(obs, previous.observation)) return fail();
    const step: RecordedStep = {
      stepIndex: i,
      simTimeS: time,
      observationT: obs,
      nextObservation: next,
      requestedActionT: readCommand(s.requestedActionT),
      appliedCommandT: readCommand(s.appliedCommandT),
      nextStateTruth: readPose(s.nextStateTruth),
      nextOutcome: outcome(s.nextOutcome),
      wallTimestamp: timestamp(s.wallTimestamp),
      rawInput: {
        ...context(raw),
        gear: raw.gear as Gear,
        inputs: raw.inputs as DriverInput[],
        analogSteer:
          raw.analogSteer === null ? null : num(raw.analogSteer, -1, 1),
      },
    };
    e.steps.push(step);
    previous = recordedFrame(e, i + 1);
  }
  const footer = obj(r.footer),
    reason =
      footer.terminationReason as LocalEpisode["footer"]["terminationReason"];
  if (
    ![
      "success",
      "collision",
      "timeout",
      "user_abort",
      "incomplete",
      "engine_error",
      "policy_error",
    ].includes(String(reason)) ||
    (previous.outcome.terminated
      ? previous.outcome.reason !== reason
      : !["user_abort", "incomplete", "engine_error", "policy_error"].includes(
          String(reason),
        )) ||
    (reason === "policy_error" && h.controllerKind !== "learned")
  )
    return fail();
  const expected = episodeFooter(e, reason);
  for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
    const value = expected[k];
    if (
      typeof value === "number"
        ? typeof footer[k] !== "number" ||
          Math.abs(num(footer[k]) - value) > 1e-6
        : footer[k] !== value
    )
      return fail();
  }
  e.footer = expected;
  return e;
}

// ponytail: 최근 5개만 IndexedDB에 보관한다. 서버·계정·무제한 보관은 별도 범위다.
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("parkside-local", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("episodes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      database = undefined;
      reject(Error("다른 탭의 기록 저장소를 닫아주세요."));
    };
  }));
}
export async function saveEpisode(e: LocalEpisode) {
  const db = await openDatabase();
  // 호출 시점의 snapshot을 직렬화한 뒤 원자적 transaction으로 교체한다.
  const text = JSON.stringify(e);
  if (new TextEncoder().encode(text).length > EPISODE_BYTES)
    throw Error("기록 저장 상한을 초과했어요.");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("episodes", "readwrite"),
      store = tx.objectStore("episodes");
    const existing = store.getKey(e.header.episodeId);
    existing.onsuccess = () => {
      store.put({
        id: e.header.episodeId,
        startedAt: e.header.startedAt,
        text,
      });
      // 체크포인트 교체 때는 다른 기록 본문을 읽지 않는다. 새 실행에서만 보관 상한 정리.
      if (existing.result !== undefined) return;
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = all.result.sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt),
        );
        for (const row of rows.slice(5)) store.delete(row.id);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function listEpisodes(): Promise<LocalEpisode[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const r = db.transaction("episodes").objectStore("episodes").getAll();
    r.onsuccess = () => {
      try {
        resolve(
          r.result
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .map((row) => parseEpisode(row.text)),
        );
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export async function deleteEpisode(id?: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("episodes", "readwrite"),
      store = tx.objectStore("episodes");
    if (id) store.delete(id);
    else store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
