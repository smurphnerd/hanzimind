import { defineConfig, devices } from "@playwright/test";

const lane = Number(process.env.E2E_LANE ?? 0);
const port = Number(process.env.LANE_PORT_BASE ?? 3000) + lane;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export const LEARNER_STATE = "test-results/playwright/learner-state.json";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "sign-in", testMatch: /sign-in\.spec\.ts/ },
    {
      name: "signed-in",
      testMatch: /study-.*\.spec\.ts/,
      dependencies: ["sign-in"],
      use: { storageState: LEARNER_STATE },
    },
    { name: "public", testMatch: /dictionary-.*\.spec\.ts/ },
  ],
  webServer: {
    command: "e2e/lane.sh",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 15 * 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
