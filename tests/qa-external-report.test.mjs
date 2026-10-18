import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("relatórios JSON/Markdown não copiam segredos de uma resposta JSON inválida", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qa-external-report-"));
  try {
    const entry = new URL("../qa-external/run.mjs", import.meta.url).href;
    const script = `
      globalThis.fetch = async url => new Response(
        url.endsWith('/health') ? 'QA_SECRET_SENTINEL' : '{}',
        {status: url.endsWith('/health') ? 200 : 401, headers: {'content-type': 'application/json'}}
      );
      await import(${JSON.stringify(entry)});
    `;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          QA_API_URL: "https://qa.example.test/api/v1",
          QA_WEB_URL: "",
          QA_MODE: "read",
          QA_OUTPUT_DIR: dir,
        },
        timeout: 10000,
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      (result.stdout + result.stderr).includes("QA_SECRET_SENTINEL"),
      false
    );
    const files = await readdir(dir);
    assert.equal(files.length, 2);
    for (const file of files) {
      const text = await readFile(join(dir, file), "utf8");
      assert.equal(text.includes("QA_SECRET_SENTINEL"), false, file);
      assert.match(text, /Resposta JSON inválida da API/);
      if (file.endsWith(".json")) {
        const report = JSON.parse(text);
        assert.deepEqual(report.counts, { PASS: 1, FAIL: 1, BLOCKED: 0 });
        assert.equal(report.productionApproved, false);
        assert.equal(report.operationalHomologation, "PENDING_MANUAL");
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("relatórios não copiam erro de transporte do smoke web", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qa-web-report-"));
  try {
    const entry = new URL("../qa-external/run.mjs", import.meta.url).href;
    const script = `
      globalThis.fetch = async url => {
        if (url === 'https://web.qa.example.test') throw new Error('QA_WEB_TRANSPORT_SECRET');
        return new Response(url.endsWith('/health') ? '{"status":"ok","database":"up"}' : '{}',
          {status: url.endsWith('/health') ? 200 : 401, headers: {'content-type': 'application/json'}});
      };
      await import(${JSON.stringify(entry)});
    `;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          QA_API_URL: "https://api.qa.example.test/api/v1",
          QA_WEB_URL: "https://web.qa.example.test",
          QA_MODE: "read",
          QA_OUTPUT_DIR: dir,
        },
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      (result.stdout + result.stderr).includes("QA_WEB_TRANSPORT_SECRET"),
      false
    );
    const files = await readdir(dir);
    assert.equal(files.length, 2);
    for (const file of files) {
      const text = await readFile(join(dir, file), "utf8");
      assert.equal(text.includes("QA_WEB_TRANSPORT_SECRET"), false, file);
      assert.match(text, /Falha de transporte no front-end/);
      if (file.endsWith(".json"))
        assert.deepEqual(JSON.parse(text).counts, {
          PASS: 2,
          FAIL: 1,
          BLOCKED: 0,
        });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("reporter de navegador só publica nomes fixos, status e contagens", async () => {
  const module = await import("../qa-external/safe-reporter.mjs").catch(
    () => null
  );
  assert.equal(typeof module?.default, "function", "Reporter seguro ausente");
  const dir = await mkdtemp(join(tmpdir(), "qa-safe-reporter-"));
  const sentinel = "QA_BROWSER_SECRET_SENTINEL";
  const testcase = {
    title: "WEB-03: " + sentinel,
    expectedStatus: "passed",
    parent: { project: () => ({ name: "desktop" + sentinel }) },
  };
  let stdout = "";
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = chunk => {
      stdout += chunk;
      return true;
    };
    const reporter = new module.default({ outputDir: dir });
    assert.equal(
      reporter.printsToStdio(),
      true,
      "Não permitir reporter padrão adicional"
    );
    reporter.onBegin({}, { allTests: () => [testcase] });
    reporter.onStdOut(sentinel, testcase);
    reporter.onStdErr(sentinel, testcase);
    reporter.onError({ message: sentinel, stack: sentinel });
    const details = {
      status: "timedOut",
      error: { message: `locator.fill: Timeout; fill("${sentinel}")` },
      errors: [{ message: sentinel, errorContext: sentinel }],
      steps: [
        {
          title: sentinel,
          steps: [{ title: sentinel, error: { message: sentinel } }],
        },
      ],
      attachments: [
        { name: sentinel, body: Buffer.from(sentinel), path: sentinel },
      ],
      stdout: [sentinel],
      stderr: [sentinel],
    };
    reporter.onStepBegin?.(testcase, details, details.steps[0]);
    reporter.onStepEnd?.(testcase, details, details.steps[0]);
    reporter.onTestEnd(testcase, details);
    await reporter.onEnd({ status: "failed" });
  } finally {
    process.stdout.write = originalWrite;
  }
  try {
    assert.equal(stdout.includes(sentinel), false);
    assert.match(stdout, /FAIL/);
    const files = await readdir(dir);
    assert.equal(files.length, 1);
    const text = await readFile(join(dir, files[0]), "utf8");
    assert.equal(text.includes(sentinel), false);
    const report = JSON.parse(text);
    assert.deepEqual(report.counts, { PASS: 0, FAIL: 1, BLOCKED: 0 });
    assert.equal(report.productionApproved, false);
    assert.equal(report.operationalHomologation, "PENDING_MANUAL");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("falha Playwright sem navegador não retém erro, step, stdio ou anexo sensível", async () => {
  const require = createRequire(import.meta.url);
  const testPackage = dirname(require.resolve("@playwright/test/package.json"));
  const dir = await mkdtemp(join(tmpdir(), "qa-playwright-report-"));
  try {
    const caseDir = join(dir, "cases");
    const reportDir = join(dir, "reports");
    const outputDir = join(dir, "outputs");
    await mkdir(caseDir);
    const config = join(dir, "playwright.config.cjs");
    const sourceConfig = fileURLToPath(
      new URL("../qa-external/playwright.config.ts", import.meta.url)
    );
    await writeFile(
      config,
      `
      const path = require('node:path');
      const external = require(${JSON.stringify(sourceConfig)}).default;
      module.exports = {...external, testDir: ${JSON.stringify(caseDir)}, testMatch: '*.spec.cjs',
        outputDir: ${JSON.stringify(outputDir)},
        reporter: external.reporter.map(([name, options]) => [
          name.startsWith('.') ? path.resolve(${JSON.stringify(dirname(sourceConfig))}, name) : name,
          {...options, outputFolder: ${JSON.stringify(reportDir)}, outputDir: ${JSON.stringify(reportDir)}}
        ])};
    `
    );
    await writeFile(
      join(caseDir, "failure.spec.cjs"),
      `
      const {test, expect} = require(${JSON.stringify(join(testPackage, "index.js"))});
      const secret = process.env.QA_TEST_PASSWORD;
      test('WEB-02: controle de cópia de página no worker', async () => {
        expect(process.env.PLAYWRIGHT_NO_COPY_PROMPT).toBe('1');
      });
      test('WEB-03: login/logout de conta sintética existente', async ({}, testInfo) => {
        console.log(secret);
        console.error(secret);
        await testInfo.attach(secret, {body: Buffer.from(secret), contentType: 'text/plain'});
        await test.step('outer ' + secret, async () => {
          await test.step('locator.fill(' + secret + ')', async () => {
            throw new Error('locator.fill: Timeout 30ms; call log: fill("' + secret + '")');
          });
        });
      });
      test('WEB-02: erro de página e falha de step capturada', async () => {
        try {
          await test.step('locator.fill(' + secret + ')', async () => {
            throw new Error('locator.fill: Timeout; fill("' + secret + '")');
          });
        } catch {}
        expect([secret], 'Simula diff de pageerror remoto').toEqual([]);
      });
    `
    );
    const sentinel = "QA_BROWSER_SECRET_SENTINEL";
    const result = spawnSync(
      process.execPath,
      [join(testPackage, "cli.js"), "test", "-c", config],
      {
        encoding: "utf8",
        timeout: 30000,
        env: {
          ...process.env,
          QA_WEB_URL: "https://qa.example.test",
          QA_TEST_EMAIL: "qa@example.test",
          QA_TEST_PASSWORD: sentinel,
          PLAYWRIGHT_HTML_OPEN: "never",
        },
      }
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      (result.stdout + result.stderr).includes(sentinel),
      false,
      "stdout/stderr"
    );
    assert.match(result.stdout, /FAIL/);
    const files = [];
    for (const root of [reportDir, outputDir]) {
      for (const name of await readdir(root, { recursive: true }).catch(
        () => []
      )) {
        const path = join(root, name);
        if ((await stat(path)).isFile()) files.push(path);
      }
    }
    assert.ok(
      files.some(file => file.endsWith(".json")),
      "Resumo seguro salvo"
    );
    let summary;
    for (const file of files) {
      assert.equal(
        file.endsWith(".html") || file.endsWith("error-context.md"),
        false,
        file
      );
      assert.equal(
        (await readFile(file, "utf8")).includes(sentinel),
        false,
        file
      );
      if (file.includes("qa-browser-"))
        summary = JSON.parse(await readFile(file, "utf8"));
    }
    assert.ok(
      summary,
      "Resumo do reporter, não apenas metadados internos do Playwright"
    );
    assert.deepEqual(summary.counts, { PASS: 2, FAIL: 4, BLOCKED: 0 });
    assert.equal(
      summary.runErrors,
      0,
      "Casos executados; falha de carregamento não substitui a reprodução"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("configuração recusa reporter adicional que contornaria a fronteira segura", () => {
  const require = createRequire(import.meta.url);
  const testPackage = dirname(require.resolve("@playwright/test/package.json"));
  const config = fileURLToPath(
    new URL("../qa-external/playwright.config.ts", import.meta.url)
  );
  for (const [extraArgs, extraEnv] of [
    [[], { PW_TEST_REPORTER: "list" }],
    [["--reporter=list"], {}],
    [["--reporter", "list"], {}],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        join(testPackage, "cli.js"),
        "test",
        "-c",
        config,
        "--list",
        ...extraArgs,
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          QA_WEB_URL: "https://qa.example.test",
          PW_TEST_REPORTER: "",
          ...extraEnv,
        },
      }
    );
    assert.equal(
      result.status,
      1,
      "Reporter bruto deve ser recusado antes dos testes"
    );
    assert.match(
      result.stdout + result.stderr,
      /Reporter externo adicional ou substituto recusado/
    );
  }
});
