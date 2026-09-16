import { createServer, type IncomingMessage } from "node:http";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdirSync,
  chmodSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { ParkingEngine } from "../engine/src/index";
import { makeScenario } from "../web/src/driving";
import {
  appendStep,
  beginEpisode,
  finishEpisode,
  parseEpisode,
} from "../web/src/episodes";

export const CONSENT_VERSION = "local-synthetic.v1";
export const RETENTION_S = 3600;
const PREFIX = "/api/local-contributions";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function syntheticEpisode() {
  const s = makeScenario("open"),
    engine = new ParkingEngine();
  const context = { viewMode: "top", assistanceFlags: [] };
  let before = {
    observation: engine.reset(s),
    poseTruth: s.start,
    simTimeS: 0,
    appliedCommand: { targetSpeedMps: 0, targetSteeringRad: 0 },
    outcome: { terminated: false, reason: null },
  } as ReturnType<ParkingEngine["step"]>;
  const e = beginEpisode(s, before, context);
  for (let i = 0; i < 5; i++) {
    const command = { targetSpeedMps: 0, targetSteeringRad: 0 },
      after = engine.step(command);
    appendStep(e, before, command, after, {
      ...context,
      gear: "P",
      inputs: [],
      analogSteer: null,
    });
    before = after;
  }
  return parseEpisode(JSON.stringify(finishEpisode(e, "user_abort")));
}
function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0,
      rejected = false;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024) {
        rejected = true;
        chunks.length = 0;
        reject(new RequestError(413, "요청은 1 KiB 이하여야 합니다."));
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new RequestError(400, "JSON 요청을 확인하세요."));
      }
    });
    req.on("error", () =>
      reject(new RequestError(400, "요청이 중단됐습니다.")),
    );
    req.on("aborted", () =>
      reject(new RequestError(400, "요청이 중단됐습니다.")),
    );
  });
}

// 개발용 합성 기록만: 실제 Episode를 받는 API로 확장하려면 보관/운영 동의를 먼저 결정한다.
export function localContributionServer({
  directory,
  enabled = false,
  now = Date.now,
}: {
  directory: string;
  enabled?: boolean;
  now?: () => number;
}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const names = () =>
    readdirSync(directory).filter((n) => /^[0-9a-f-]{36}\.json$/.test(n));
  function prune() {
    for (const name of names()) {
      const value = JSON.parse(readFileSync(join(directory, name), "utf8"));
      if (value.expiresAt <= now()) unlinkSync(join(directory, name));
    }
  }
  let windowStart = now(),
    requests = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, value: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    try {
      const address = server.address(),
        port = typeof address === "object" && address ? address.port : 0;
      if (
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(
          req.headers.host ?? "",
        )
      )
        throw new RequestError(403, "로컬 Host만 허용합니다.");
      const origin = req.headers.origin;
      if (
        origin &&
        ![
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
        ].includes(origin)
      )
        throw new RequestError(403, "다른 Origin은 허용하지 않습니다.");
      if (now() - windowStart >= 60000) {
        windowStart = now();
        requests = 0;
      }
      if (++requests > 60) {
        res.setHeader("Retry-After", "60");
        throw new RequestError(429, "분당 60회까지 테스트할 수 있습니다.");
      }
      const path = req.url ?? "";
      if (path === PREFIX && req.method === "GET") {
        reply(200, {
          mode: enabled ? "synthetic-only" : "disabled",
          consentVersion: CONSENT_VERSION,
          retentionSeconds: RETENTION_S,
        });
        return;
      }
      if (!enabled)
        throw new RequestError(
          503,
          "로컬 합성 테스트가 꺼져 있습니다. 실제 사용자 수집은 지원하지 않습니다.",
        );
      if (req.headers["x-parkside-test"] !== "1")
        throw new RequestError(403, "명시적인 로컬 테스트 요청이 필요합니다.");
      prune();
      if (path === PREFIX && req.method === "POST") {
        if (req.headers["content-type"] !== "application/json")
          throw new RequestError(415, "application/json만 허용합니다.");
        const input = (await body(req)) as Record<string, unknown>;
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).sort().join(",") !==
            "consent,consentVersion,fixture" ||
          input.consent !== true ||
          input.consentVersion !== CONSENT_VERSION ||
          input.fixture !== "stationary.v1"
        )
          throw new RequestError(
            400,
            "동의 버전과 합성 fixture를 확인하세요. 실제 기록 업로드는 거부합니다.",
          );
        if (names().length >= 20)
          throw new RequestError(
            507,
            "로컬 보관 한도 20개입니다. 삭제하거나 만료를 기다리세요.",
          );
        const id = randomUUID(),
          token = randomBytes(32).toString("base64url"),
          expiresAt = now() + RETENTION_S * 1000;
        const record = {
          id,
          expiresAt,
          ownerHash: hash(token),
          source: "synthetic-test",
          consent: { version: CONSENT_VERSION, grantedAt: now() },
          episode: syntheticEpisode(),
        };
        const filename = join(directory, `${id}.json`);
        writeFileSync(filename, JSON.stringify(record), {
          flag: "wx",
          mode: 0o600,
        });
        reply(201, { id, token, expiresAt });
        return;
      }
      const id = path.slice(PREFIX.length + 1);
      if (
        !path.startsWith(`${PREFIX}/`) ||
        !/^[0-9a-f-]{36}$/.test(id) ||
        !["GET", "DELETE"].includes(req.method ?? "")
      )
        throw new RequestError(404, "기록이 없거나 권한이 없습니다.");
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new RequestError(404, "기록이 없거나 권한이 없습니다.");
      let record;
      const filename = join(directory, `${id}.json`);
      try {
        record = JSON.parse(readFileSync(filename, "utf8"));
      } catch {
        throw new RequestError(404, "기록이 없거나 권한이 없습니다.");
      }
      if (
        !timingSafeEqual(
          Buffer.from(hash(token), "hex"),
          Buffer.from(record.ownerHash, "hex"),
        )
      )
        throw new RequestError(404, "기록이 없거나 권한이 없습니다.");
      if (req.method === "DELETE") {
        unlinkSync(filename);
        reply(200, { deleted: true });
        return;
      }
      const { ownerHash: _ownerHash, ...visible } = record;
      reply(200, visible);
    } catch (error) {
      reply(error instanceof RequestError ? error.status : 500, {
        error:
          error instanceof RequestError
            ? error.message
            : "로컬 저장소 오류입니다. 실제 사용자 수집에 사용하지 마세요.",
      });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 32;
  server.maxConnections = 20;
  const timer = setInterval(() => {
    try {
      prune();
    } catch {
      /* 다음 요청은 저장소 오류를 응답한다. */
    }
  }, 60000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return server;
}
