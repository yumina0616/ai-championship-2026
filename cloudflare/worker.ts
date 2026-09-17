// 공개 웹 foundation. 사용자 기록 접수는 익명성/운영 검증 전 fail-closed.
// R2에 쓰는 임의 입력 API나 로컬 합성 테스트 서버를 공개하지 않는다.
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RECORDS: {
    get(key: string): Promise<{ text(): Promise<string> } | null>;
  };
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
    if (path === "/api/health" && request.method === "GET") {
      // 고정 합성 파일만 확인한다. 객체명/사용자 기록을 조회 인자로 받지 않는다.
      try {
        const object = await env.RECORDS.get("operations/storage-check.json");
        const ok = object !== null && (await object.text()) === '{"kind":"synthetic-storage-check","version":1}\n';
        return json({ service: "parkside", storage: ok ? "ready" : "unavailable", collection: "disabled" }, ok ? 200 : 503);
      } catch {
        return json({ service: "parkside", storage: "unavailable", collection: "disabled" }, 503);
      }
    }
    if (path === "/api/collection" && request.method === "GET") {
      return json({ enabled: false, reason: "privacy-and-ingestion-review-pending" });
    }
    if (path === "/api/episodes" && request.method === "POST") {
      // body를 읽거나 로그로 남기지 않는다. flag 하나로 잘못 열리지 않게 구현 자체를 닫는다.
      return json({ error: "collection_disabled" }, 503);
    }
    return json({ error: "not_found" }, 404);
  },
};
