import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: true,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    // 소프트웨어 GPU의 연속 readback을 피하고 DOM/네트워크와 실패 화면은 보관합니다.
    trace: {
      mode: "retain-on-failure",
      screenshots: false,
      snapshots: true,
      sources: true,
    },
    screenshot: "only-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
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
