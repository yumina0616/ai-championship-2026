import { defineConfig, devices } from "@playwright/test";
import { NOTICE_VERSION } from "./src/collection-record";

const mesa = process.env.PARKSIDE_TEST_MESA === "1";

export default defineConfig({
  globalSetup: mesa ? "./tests/check-webgl.ts" : undefined,
  testDir: "./tests",
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: true,
  workers: 1,
  use: {
    headless: !mesa,
    baseURL: "http://127.0.0.1:5173",
    // 연속 WebGL 화면 readback은 소프트웨어 GPU의 입력 처리를 지연시킵니다.
    // DOM/네트워크 trace와 실패 스크린샷은 유지합니다.
    trace: {
      mode: "retain-on-failure",
      screenshots: false,
      snapshots: true,
      sources: true,
    },
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--use-gl=angle",
        mesa ? "--use-angle=gl" : "--use-angle=swiftshader",
        ...(mesa ? ["--ignore-gpu-blocklist"] : []),
      ],
    },
    // 기존 운전 회귀 검사는 선택을 마친 재방문 사용자. 첫 방문은 interaction-flow에서 빈 저장소로 검사한다.
    storageState: {
            cookies: [],
            origins: [
              {
                origin: "http://127.0.0.1:5173",
                localStorage: [
                  { name: "mrpark-record-choice", value: NOTICE_VERSION },
                  { name: "parkside-record-locally", value: "on" },
                  ...(process.env.CI || process.env.PARKSIDE_TEST_LOW ? [{ name: "parkside-quality", value: "low" }] : []),
                ],
              },
            ],
          },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
