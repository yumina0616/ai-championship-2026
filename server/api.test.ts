import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { localContributionServer, CONSENT_VERSION, RETENTION_S } from "./api";

const consent = {
  fixture: "stationary.v1",
  consent: true,
  consentVersion: CONSENT_VERSION,
};
async function setup(t: TestContext, enabled = true) {
  const directory = mkdtempSync(join(tmpdir(), "parkside-api-test-"));
  let now = Date.now();
  const server = localContributionServer({
    directory,
    enabled,
    now: () => now,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/local-contributions`;
  t.after(async () => {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
    rmSync(directory, { recursive: true, force: true });
  });
  const request = (
    path = "",
    method = "GET",
    value?: unknown,
    token?: string,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-parkside-test": "1",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
  return {
    request,
    directory,
    base,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("기본 비활성: 실제 사용자 기록과 동의 없는 테스트는 저장하지 않음", async (t) => {
  const a = await setup(t, false);
  assert.equal((await (await a.request()).json()).mode, "disabled");
  assert.equal((await a.request("", "POST", consent)).status, 503);
  assert.equal(readdirSync(a.directory).length, 0);
  const b = await setup(t);
  for (const invalid of [
    { ...consent, consent: false },
    { ...consent, consentVersion: "old" },
    { ...consent, episode: { personal: "not accepted" } },
    null,
  ]) {
    assert.equal((await b.request("", "POST", invalid)).status, 400);
  }
  assert.equal(readdirSync(b.directory).length, 0);
});
test("개별 권한·소유자 조회·삭제·만료", async (t) => {
  const a = await setup(t);
  const one = await (await a.request("", "POST", consent)).json();
  const two = await (await a.request("", "POST", consent)).json();
  assert.equal(one.token.length, 43);
  assert.equal((await a.request(`/${one.id}`)).status, 404);
  assert.equal(
    (await a.request(`/${one.id}`, "GET", undefined, two.token)).status,
    404,
  );
  assert.equal(
    (await a.request(`/${one.id}`, "DELETE", undefined, two.token)).status,
    404,
  );
  const stored = await (
    await a.request(`/${one.id}`, "GET", undefined, one.token)
  ).json();
  assert.equal(stored.source, "synthetic-test");
  assert.equal(stored.episode.steps.length, 5);
  assert.equal(stored.consent.version, CONSENT_VERSION);
  assert.equal(stored.ownerHash, undefined);
  assert.equal(
    (await a.request(`/${one.id}`, "DELETE", undefined, one.token)).status,
    200,
  );
  assert.equal(
    (await a.request(`/${one.id}`, "GET", undefined, one.token)).status,
    404,
  );
  a.advance((RETENTION_S + 1) * 1000);
  assert.equal(
    (await a.request(`/${two.id}`, "GET", undefined, two.token)).status,
    404,
  );
  assert.equal(readdirSync(a.directory).length, 0);
});
test("교차 Origin·Host·과대 요청·요청 빈도와 저장 개수 제한", async (t) => {
  const a = await setup(t);
  assert.equal(
    (
      await a.request("", "POST", consent, undefined, {
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const badHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      a.base,
      { headers: { host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(badHost, 403);
  assert.equal((await a.request("", "POST", "x".repeat(2048))).status, 413);
  for (let i = 0; i < 20; i++)
    assert.equal((await a.request("", "POST", consent)).status, 201);
  assert.equal((await a.request("", "POST", consent)).status, 507);
  let status = 0;
  for (let i = 0; i < 65; i++) status = (await a.request()).status;
  assert.equal(status, 429);
  a.advance(60000);
  assert.equal((await a.request()).status, 200);
});
