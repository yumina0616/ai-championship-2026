import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: true,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
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
