import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: true,
  workers: 1,
  use: {
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
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    },
    storageState:
      process.env.CI || process.env.PARKSIDE_TEST_LOW
        ? {
            cookies: [],
            origins: [
              {
                origin: "http://127.0.0.1:5173",
                localStorage: [{ name: "parkside-quality", value: "low" }],
              },
            ],
          }
        : undefined,
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
