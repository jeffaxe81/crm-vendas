import { defineConfig } from "@playwright/test";
import { normalizeWebUrl } from "./guards.mjs";

// O runner Playwright aceita reporter extra por ambiente ou substituição CLI.
if (
  process.env.PW_TEST_REPORTER ||
  process.argv.some(
    arg => arg === "--reporter" || arg.startsWith("--reporter=")
  )
) {
  throw new Error("Reporter externo adicional ou substituto recusado.");
}

const webUrl = normalizeWebUrl(process.env.QA_WEB_URL);
if (!webUrl)
  throw new Error("Informe QA_WEB_URL explícita. Não use o fallback.");

// Playwright 1.62: impede cópia da página/ARIA para contexto de erro.
// preserveOutput=never remove os demais contextos/anexos temporários do teste.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: ".",
  testMatch: "browser.spec.ts",
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["./safe-reporter.mjs"]],
  quiet: true,
  preserveOutput: "never",
  captureGitInfo: { commit: false, diff: false },
  outputDir: "qa-external/artifacts/playwright-results",
  use: {
    baseURL: webUrl,
    ignoreHTTPSErrors: false,
    serviceWorkers: "block",
    // Nem página pública deve persistir payloads remotos ou contextos de falha.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
      },
    },
  ],
});
