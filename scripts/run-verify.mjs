import { spawnSync } from "node:child_process";

const stages = [
  ["foundation", "verify:foundation"],
  ["format", "format:check"],
  ["lint", "lint"],
  ["typecheck", "typecheck"],
  ["tests", "test"],
  ["build", "build"],
];

for (const [label, script] of stages) {
  const result = spawnSync("pnpm", [script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(
      `::error title=Verification failed::${label}: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    const exitCode = result.status ?? 1;
    console.error(
      `::error title=Verification failed::${label} failed with exit code ${exitCode}`,
    );
    process.exit(exitCode);
  }
}
