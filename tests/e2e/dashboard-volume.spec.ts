import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { openWorkspaceSection } from "./helpers/workspace-navigation";

test("volume panel refreshes real counts, compares readings and downloads aggregate CSV", async ({
  page,
}) => {
  const api = "http://127.0.0.1:3001/api/v1";
  const suffix = randomUUID();
  const companyName = `Private company ${suffix}`;
  const registered = await page.request.post(`${api}/auth/register`, {
    data: {
      organizationName: `Dashboard ${suffix}`,
      adminDisplayName: "Dashboard tester",
      adminEmail: `dashboard-${suffix}@example.test`,
      adminPassword: "Dashboard-E2E-password-2026!",
    },
  });
  expect(registered.ok()).toBe(true);
  await page.goto("http://127.0.0.1:3000");
  await openWorkspaceSection(page, "Resumo gerencial");

  const initialResponse = page.waitForResponse(
    response =>
      response.url() === `${api}/dashboards/volume` &&
      response.request().method() === "GET"
  );
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();
  const initial = await initialResponse;
  expect(initial.ok()).toBe(true);
  expect(initial.headers()["cache-control"]).toBe("private, no-store");
  const panel = page.getByRole("region", {
    name: "Volume de registros do CRM",
    exact: true,
  });
  const companies = panel
    .locator("article")
    .filter({ hasText: "Empresas ativas" });
  await expect(companies.locator("strong")).toHaveText("0");
  const comparison = panel.getByRole("region", {
    name: "Comparação com a última consulta da sessão",
  });
  await expect(comparison).toHaveCount(0);

  // Use the browser's current session instead of an obsolete registration
  // token: initial session refresh may already have rotated that session.
  const authorization = await initial.request().headerValue("authorization");
  expect(authorization).toBeTruthy();
  const created = await page.request.post(`${api}/companies`, {
    headers: { Authorization: authorization! },
    data: { legalName: companyName },
  });
  expect(created.ok()).toBe(true);

  const updatedResponse = page.waitForResponse(
    response =>
      response.url() === `${api}/dashboards/volume` &&
      response.request().method() === "GET"
  );
  await panel.getByRole("button", { name: "Atualizar volume" }).click();
  const updated = await updatedResponse;
  expect(updated.ok()).toBe(true);
  const snapshot = await updated.json();
  await expect(companies.locator("strong")).toHaveText("1");
  await expect(comparison).toBeVisible();
  await expect(
    comparison.getByText("Empresas ativas: +1", { exact: true })
  ).toBeVisible();
  await expect(
    comparison.locator("p").filter({ hasText: "Variação total:" })
  ).toHaveText(/Variação total:\s*\+1/);

  const downloadEvent = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Exportar CSV de indicadores" })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("dashboard-volume.csv");
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path!, "utf8");
  expect(csv.trim().split(/\r?\n/)).toEqual([
    '"Indicador";"Quantidade"',
    '"Empresas ativas";"1"',
    '"Contatos ativos";"0"',
    '"Oportunidades ativas";"0"',
    '"Atividades ativas";"0"',
    '"Total de registros ativos";"1"',
    `"Atualizado em (UTC)";"${snapshot.asOf}"`,
  ]);
  expect(csv).not.toContain(companyName);

  await page.reload();
  await openWorkspaceSection(page, "Resumo gerencial");
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();
  await expect(companies.locator("strong")).toHaveText("1");
  await expect(comparison).toHaveCount(0);
});
