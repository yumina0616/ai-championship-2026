import { parseEpisode, type LocalEpisode } from "./episodes";

export const NOTICE_VERSION = "mr-park-learning-2026-09-17.v1";
export const COLLECTION_BYTES = 8 * 1024 * 1024;
export const RETENTION_DAYS = 30;
const ZERO_ID = "00000000-0000-4000-8000-000000000000";
const ZERO_TIME = "2000-01-01T00:00:00.000Z";

// 기존 로컬 parser를 재사용하되 사용자 ID·이름·실제 시각은 전송하지 않는다.
export function collectionRecord(episode: LocalEpisode) {
  return packValidatedRecord(parseEpisode(JSON.stringify(episode)));
}
function packValidatedRecord(e: LocalEpisode) {
  if (!e.steps.length || !e.footer.logComplete) throw Error("완료된 기록만 전송해요.");
  if (e.header.scenarioSnapshot.scenarioId === "parkside-custom-v1") {
    e.header.scenarioSnapshot.obstacles.forEach((o, i) => { o.id = `${o.id.split("-")[0]}-${i}`; });
  }
  const { episodeId: _id, startedAt: _time, consent: _consent, ...header } = e.header;
  return {
    schema: "mr-park-record.v1" as const, noticeVersion: NOTICE_VERSION, header, initial: e.initial,
    // 전 단계 관측/시간은 복원 가능하다. 같은 센서값을 두 번 전송하지 않는다.
    steps: e.steps.map(({ observationT: _o, wallTimestamp: _t, stepIndex: _i, simTimeS: _s, ...step }) => step),
    footer: e.footer,
  };
}
export type CollectionRecord = ReturnType<typeof collectionRecord>;
export function readCollectionRecord(text: string): { record: CollectionRecord; episode: LocalEpisode } {
  if (new TextEncoder().encode(text).length > COLLECTION_BYTES) throw Error("record_too_large");
  const r = JSON.parse(text);
  if (r?.schema !== "mr-park-record.v1" || r.noticeVersion !== NOTICE_VERSION ||
      !Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 1801) throw Error("invalid_record");
  const episode = parseEpisode(JSON.stringify({
    header: { ...r.header, episodeId: ZERO_ID, startedAt: ZERO_TIME, consent: { status: "not_requested", version: null } },
    initial: r.initial,
    steps: r.steps.map((s: Record<string, unknown>, i: number) => ({
      ...s, stepIndex: i, simTimeS: (i + 1) * 0.05, wallTimestamp: ZERO_TIME,
      observationT: i === 0 ? r.initial?.observation : r.steps[i - 1]?.nextObservation,
    })),
    footer: r.footer,
  }));
  const record = packValidatedRecord(episode);
  episode.header.scenarioSnapshot = record.header.scenarioSnapshot;
  return { record, episode };
}
