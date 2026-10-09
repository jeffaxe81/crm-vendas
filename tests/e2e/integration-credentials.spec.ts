import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openWorkspaceSection } from "./helpers/workspace-navigation";

test("an administrator creates a scoped key once and revokes its API access from the CRM", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const api = "http://127.0.0.1:3001/api/v1";
  const suffix = randomUUID();
  try {
    const registered = await context.request.post(`${api}/auth/register`, {
      data: {
        organizationName: `Integration ${suffix}`,
        adminDisplayName: "Integration tester",
        adminEmail: `integration-${suffix}@example.test`,
        adminPassword: "Integration-E2E-password-2026!",
      },
    });
    expect(registered.ok()).toBeTruthy();
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3000");
    await openWorkspaceSection(page, "Chaves de integração");
    await expect(page.getByText("Nenhuma chave cadastrada.")).toBeVisible();
    await page.getByLabel("Nome da integração").fill("ERP E2E");
    await page.getByLabel("Consultar empresas", { exact: true }).check();
    await page.getByRole("button", { name: "Criar chave" }).click();
    const output = page.getByLabel("Chave de API");
    await expect(output).toBeVisible();
    const key = (await output.innerText()).trim();
    expect(key).toMatch(/^axk_/);
    const headers = { Authorization: `Bearer ${key}` };
    expect(
      (await context.request.get(`${api}/companies`, { headers })).status()
    ).toBe(200);
    expect(
      (await context.request.get(`${api}/contacts`, { headers })).status()
    ).toBe(403);
    await page.getByRole("button", { name: "Já guardei a chave" }).click();
    await expect(page.getByLabel("Chave de API")).toHaveCount(0);
    await page.reload();
    await openWorkspaceSection(page, "Chaves de integração");
    const credential = page.getByRole("article", {
      name: "Chave ERP E2E",
      exact: true,
    });
    await expect(credential).toBeVisible();
    await expect(page.getByLabel("Chave de API")).toHaveCount(0);
    await page.getByRole("button", { name: "Revogar ERP E2E" }).click();
    await page.getByRole("button", { name: "Confirmar revogação" }).click();
    await expect(
      credential.getByText("Revogada", { exact: true })
    ).toBeVisible();
    expect(
      (await context.request.get(`${api}/companies`, { headers })).status()
    ).toBe(401);
  } finally {
    await context.close();
  }
});
