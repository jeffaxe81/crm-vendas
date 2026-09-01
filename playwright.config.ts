import { defineConfig } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://axes:axes@127.0.0.1:5432/axes_crm";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @axes/api exec tsx src/main.ts",
      url: "http://127.0.0.1:3001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "3001",
        LOG_LEVEL: "warn",
        DATABASE_URL: databaseUrl,
      },
    },
    {
      command: "pnpm --filter @axes/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3001/api/v1",
      },
    },
  ],
});
