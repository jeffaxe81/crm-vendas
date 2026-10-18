import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const testNames = [
  ["WEB-02:", "WEB-02: tela de acesso"],
  ["WEB-03:", "WEB-03: login/logout sintético"],
];

function fixedCase(test) {
  const name =
    testNames.find(([prefix]) => test.title?.startsWith(prefix))?.[1] ||
    "WEB-UNKNOWN: teste não catalogado";
  const projectName = test.parent?.project()?.name;
  const project = ["desktop", "mobile"].includes(projectName)
    ? projectName
    : "unknown";
  return { name, project, status: "BLOCKED" };
}

/** Nunca serializa objetos Playwright: podem conter senha em erros e steps. */
export default class SafeQaReporter {
  constructor(options = {}) {
    this.outputDir = resolve(
      options.outputDir || "qa-external/artifacts/browser-safe"
    );
    this.mode = options._mode === "list" ? "list" : "test";
    this.cases = new Map();
    this.runErrors = 0;
  }

  // false adicionaria automaticamente um reporter padrão que imprime erros.
  printsToStdio() {
    return true;
  }

  onBegin(_config, suite) {
    for (const test of suite.allTests()) this.cases.set(test, fixedCase(test));
  }

  // Erros, steps, stdout, stderr e anexos nunca atravessam esta fronteira.
  onStdOut() {}
  onStdErr() {}
  onStepBegin() {}
  onStepEnd() {}
  onError() {
    this.runErrors++;
  }

  onTestEnd(test, result) {
    const item = this.cases.get(test) || fixedCase(test);
    item.status =
      result.status === "passed" && test.expectedStatus === "passed"
        ? "PASS"
        : ["failed", "timedOut"].includes(result.status)
          ? "FAIL"
          : "BLOCKED";
    this.cases.set(test, item);
  }

  async onEnd(result) {
    const scenarios = [...this.cases.values()];
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
    for (const item of scenarios) counts[item.status]++;
    const status =
      counts.FAIL || this.runErrors || result.status === "failed"
        ? "FAIL"
        : this.mode === "list" ||
            !scenarios.length ||
            counts.BLOCKED ||
            result.status !== "passed"
          ? "BLOCKED"
          : "PASS";
    const report = {
      suite: "qa-external-browser",
      mode: this.mode,
      status,
      counts,
      runErrors: this.runErrors,
      productionApproved: false,
      operationalHomologation: "PENDING_MANUAL",
      scenarios,
    };
    try {
      await mkdir(this.outputDir, { recursive: true, mode: 0o700 });
      await writeFile(
        resolve(this.outputDir, "qa-browser-" + randomUUID() + ".json"),
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 }
      );
    } catch {
      console.log("BLOCKED QA_BROWSER: resumo seguro não pôde ser salvo.");
      return { status: "failed" };
    }
    for (const item of scenarios)
      console.log(item.status + " " + item.project + " " + item.name);
    console.log(
      "QA_BROWSER " +
        status +
        " " +
        JSON.stringify(counts) +
        "; homologação operacional PENDENTE."
    );
  }
}
