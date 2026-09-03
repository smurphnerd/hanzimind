import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const lane = Number(process.env.E2E_LANE ?? 0);
const port = lanePort(lane);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export const LEARNER_STATE = "test-results/playwright/learner-state.json";

// Same rule as lane-lib.sh: an explicit LANE_PORT_BASE wins, then the port the
// lane was started on, then 3000 + n.
function lanePort(n: number): number {
  if (process.env.LANE_PORT_BASE) return Number(process.env.LANE_PORT_BASE) + n;
  try {
    const env = readFileSync(`development/lanes/${n}/.env.lane`, "utf8");
    const match = /^BASE_URL=http:\/\/localhost:(\d+)/m.exec(env);
    if (match) return Number(match[1]);
  } catch {}
  return 3000 + n;
}

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  // The auth layer allows three sign-ins per ten seconds per address, so the
  // suite signs in exactly once: the sign-in spec saves its session and the
  // signed-in specs reuse it.
  projects: [
    { name: "sign-in", testMatch: /sign-in\.spec\.ts/ },
    {
      name: "signed-in",
      testMatch: /study-.*\.spec\.ts/,
      dependencies: ["sign-in"],
      use: { storageState: LEARNER_STATE },
    },
    { name: "public", testMatch: /dictionary-.*\.spec\.ts/ },
    {
      name: "adhoc",
      testMatch: /\.adhoc\.spec\.ts/,
      dependencies: ["sign-in"],
      use: { storageState: LEARNER_STATE },
    },
  ],
  webServer: {
    command: "e2e/lane.sh",
    url: baseURL,
    reuseExistingServer:
      !process.env.CI &&
      (process.env.E2E_LANE !== undefined ||
        process.env.E2E_BASE_URL !== undefined),
    // A warm lane is ready in about 20 seconds. A cold seed takes six minutes
    // and needs E2E_COLD=1 to say so, or a lane booted beforehand.
    timeout: (process.env.E2E_COLD || process.env.CI ? 15 : 3) * 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
