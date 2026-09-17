import { collectionRequest, collectionEnabled, type CollectionEnv } from "./collection";
// 기존 정적 웹/health 경계는 유지하고 동의 기반 수집만 별도 연결한다.
export interface Env extends CollectionEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    const collection = await collectionRequest(request, env);
    if (collection) return collection;
    if (path === "/api/health" && request.method === "GET") {
      // 고정 합성 파일만 확인한다. 객체명/사용자 기록을 조회 인자로 받지 않는다.
      try {
        const object = await env.RECORDS.get("operations/storage-check.json");
        const ok = object !== null && (await object.text()) === '{"kind":"synthetic-storage-check","version":1}\n';
        return json({ service: "parkside", storage: ok ? "ready" : "unavailable", collection: collectionEnabled(env) ? "enabled" : "disabled" }, ok ? 200 : 503);
      } catch {
        return json({ service: "parkside", storage: "unavailable", collection: collectionEnabled(env) ? "enabled" : "disabled" }, 503);
      }
    }
    return json({ error: "not_found" }, 404);
  },
};
