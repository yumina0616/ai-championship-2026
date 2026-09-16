import { resolve } from "node:path";
import { localContributionServer } from "./api";

const server = localContributionServer({
  directory: resolve("../server/.local-data"),
  enabled: process.env.PARKSIDE_LOCAL_CONTRIBUTIONS === "1",
});
server.listen(8787, "127.0.0.1", () => {
  console.log(
    "로컬 합성 기록 테스트 API: http://127.0.0.1:8787 (실제 사용자 수집 금지)",
  );
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close());
