import { COLLECTION_BYTES, NOTICE_VERSION, RETENTION_DAYS, readCollectionRecord } from "../web/src/collection-record";

export interface CollectionEnv {
  RECORDS: {
    get(key: string): Promise<{ text(): Promise<string> } | null>;
    put(key: string, value: string, options?: { onlyIf?: { etagDoesNotMatch: string }; httpMetadata?: { contentType: string } }): Promise<unknown | null>;
    delete(key: string): Promise<void>;
    list(options: { prefix: string; limit: number; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  };
  COLLECTION_ENABLED?: string;
  RETENTION_CONFIGURED?: string;
  CONTACT_EMAIL?: string;
  COLLECTION_ADMIN_TOKEN?: string;
  UPLOAD_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  GLOBAL_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" },
});
export const collectionEnabled = (env: CollectionEnv) => env.COLLECTION_ENABLED === "true" && env.RETENTION_CONFIGURED === "true" &&
  !!env.CONTACT_EMAIL && !!env.UPLOAD_LIMIT && !!env.GLOBAL_LIMIT;
const tokenPattern = /^[a-f0-9]{64}$/;
export const DAILY_RECORD_LIMIT = 200;
async function reserveDailySlot(env: CollectionEnv) {
  // pilot: R2 조건부 쓰기로 전세계 하루 최대 200개 접수. 별도 DB/큐를 만들지 않는다.
  // 충돌/실패로 빈 슬롯이 남으면 실제 접수량은 더 적을 수 있지만 상한은 넘지 않는다.
  const day = new Date().toISOString().slice(0, 10);
  const start = crypto.getRandomValues(new Uint32Array(1))[0] % DAILY_RECORD_LIMIT;
  for (let i = 0; i < 8; i++) {
    const value = await env.RECORDS.put(`daily-limit/${day}/${(start + i) % DAILY_RECORD_LIMIT}.json`, "{}", { onlyIf: { etagDoesNotMatch: "*" } });
    if (value !== null) return true;
  }
  return false;
}
export async function recordId(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
async function limitedText(request: Request) {
  if (Number(request.headers.get("content-length")) > COLLECTION_BYTES) throw Error("large");
  const reader = request.body?.getReader();
  if (!reader) throw Error("empty");
  const chunks: Uint8Array[] = [];
  let size = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 15000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw Error("timeout");
      if (done) break;
      size += value.byteLength;
      if (size > COLLECTION_BYTES) { void reader.cancel(); throw Error("large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function collectionRequest(request: Request, env: CollectionEnv): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname;
  if (path === "/api/collection" && request.method === "GET") return json({ enabled: collectionEnabled(env), noticeVersion: NOTICE_VERSION, retentionDays: RETENTION_DAYS, contact: env.CONTACT_EMAIL ?? null });
  // 운영자 전용 읽기. 토큰은 Worker secret/운영자 환경변수에만 둔다.
  if (path.startsWith("/api/admin/records") && request.method === "GET") {
    if (!env.COLLECTION_ADMIN_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.COLLECTION_ADMIN_TOKEN}`) return json({ error: "unauthorized" }, 401);
    try {
      if (path === "/api/admin/records") {
        const cursor = url.searchParams.get("cursor") ?? undefined;
        if (cursor && cursor.length > 2048) return json({ error: "invalid_cursor" }, 400);
        const page = await env.RECORDS.list({ prefix: "episodes/", limit: 25, cursor });
        return json({ keys: page.objects.map(o => o.key), cursor: page.truncated ? page.cursor : null });
      }
      const id = path.slice("/api/admin/records/".length);
      if (!tokenPattern.test(id)) return json({ error: "not_found" }, 404);
      if (await env.RECORDS.get(`revoked/${id}.json`)) return json({ error: "not_found" }, 404);
      const object = await env.RECORDS.get(`episodes/${id}.json`);
      return object ? json(JSON.parse(await object.text())) : json({ error: "not_found" }, 404);
    } catch { return json({ error: "storage_unavailable" }, 503); }
  }
  if (path !== "/api/episodes" || !["POST", "DELETE"].includes(request.method)) return null;
  if (request.method === "POST" && !collectionEnabled(env)) return json({ error: "collection_disabled" }, 503);
  if (request.headers.get("Origin") !== url.origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return json({ error: "origin_rejected" }, 403);
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!tokenPattern.test(token)) return json({ error: "invalid_receipt" }, 400);
  try {
    // 위치별 best-effort 제한이며 전세계 비용의 절대 상한이 아니다.
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    if (!env.UPLOAD_LIMIT || !env.GLOBAL_LIMIT ||
        !(await env.UPLOAD_LIMIT.limit({ key: ip })).success ||
        !(await env.GLOBAL_LIMIT.limit({ key: "collection" })).success) return json({ error: "rate_limited" }, 429);
    const id = await recordId(token), key = `episodes/${id}.json`;
    if (request.method === "DELETE") {
      await env.RECORDS.put(`revoked/${id}.json`, "{}");
      await env.RECORDS.delete(key);
      return json({ deleted: true });
    }
    if (request.headers.get("Content-Type")?.split(";")[0] !== "application/json" || request.headers.has("Content-Encoding")) return json({ error: "json_required" }, 415);
    let record;
    try { record = readCollectionRecord(await limitedText(request)).record; }
    catch { return json({ error: "invalid_or_oversized_record" }, 400); }
    if (await env.RECORDS.get(`revoked/${id}.json`)) return json({ error: "revoked" }, 410);
    if (await env.RECORDS.get(key)) return json({ stored: true, id, duplicate: true });
    if (!(await reserveDailySlot(env))) return json({ error: "daily_capacity_reached" }, 429);
    const result = await env.RECORDS.put(key, JSON.stringify({ receivedDay: new Date().toISOString().slice(0, 10), record }), {
      onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" },
    });
    if (await env.RECORDS.get(`revoked/${id}.json`)) { await env.RECORDS.delete(key); return json({ error: "revoked" }, 410); }
    return json({ stored: true, id, duplicate: result === null }, result === null ? 200 : 201);
  } catch { return json({ error: "storage_unavailable" }, 503); }
}
