import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("workspace preference syncs between browsers and stays isolated for another account", async ({
  browser,
}) => {
  const suffix = randomUUID();
  const email = `workspace-${suffix}@example.test`;
  const password = "Workspace-E2E-password-2026!";
  const first = await browser.newContext();
  const second = await browser.newContext();
  const other = await browser.newContext();
  try {
    const registered = await first.request.post(
      "http://127.0.0.1:3001/api/v1/auth/register",
      {
        data: {
          organizationName: `Workspace ${suffix}`,
          adminDisplayName: "Workspace tester",
          adminEmail: email,
          adminPassword: password,
        },
      }
    );
    expect(registered.ok()).toBeTruthy();
    const page = await first.newPage();
    await page.goto("http://127.0.0.1:3000");
    await page.getByRole("button", { name: "Personalizar início" }).click();
    await expect(page.getByLabel("Seção de abertura")).toBeEnabled();
    await page.getByLabel("Seção de abertura").selectOption("companies");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(
      page.getByText("Preferências salvas para este usuário e organização.")
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Empresas", exact: true })
    ).toBeVisible();
    const pageTwo = await second.newPage();
    await pageTwo.goto("http://127.0.0.1:3000");
    await pageTwo.getByLabel("E-mail").fill(email);
    await pageTwo.getByLabel("Senha").fill(password);
    await pageTwo.getByRole("button", { name: "Entrar no CRM" }).click();
    await expect(
      pageTwo.getByRole("heading", { name: "Empresas", exact: true })
    ).toBeVisible();
    const registeredOther = await other.request.post(
      "http://127.0.0.1:3001/api/v1/auth/register",
      {
        data: {
          organizationName: `Other ${suffix}`,
          adminDisplayName: "Other tester",
          adminEmail: `other-${suffix}@example.test`,
          adminPassword: password,
        },
      }
    );
    expect(registeredOther.ok()).toBeTruthy();
    const otherPage = await other.newPage();
    await otherPage.goto("http://127.0.0.1:3000");
    await expect(
      otherPage.getByRole("heading", { name: "Olá, Other tester" })
    ).toBeVisible();
  } finally {
    await first.close();
    await second.close();
    await other.close();
  }
});
