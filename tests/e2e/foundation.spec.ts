import { expect, test } from "@playwright/test";

const adminEmail = "admin@axes.test";
const adminPassword = "Strong-CI-Password-2026!";

test("user authenticates in the active organization and logs out", async ({
  page,
  request,
}) => {
  const health = await request.get("http://127.0.0.1:3001/api/v1/health");

  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    service: "api",
    database: "up",
  });

  await page.goto("http://127.0.0.1:3000");

  await expect(
    page.getByRole("heading", { name: "CRM Axesistemas" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword);
  await page.getByRole("button", { name: "Entrar no CRM" }).click();

  const accessPanel = page.getByLabel("Acesso ao CRM");
  await expect(
    accessPanel.getByText("Sessão ativa", { exact: true })
  ).toBeVisible();
  await expect(
    accessPanel.getByText("Axesistemas", { exact: true })
  ).toBeVisible();
  await expect(
    accessPanel.getByText("ADMIN", { exact: true })
  ).toBeVisible();
  await expect(
    accessPanel.getByText(adminEmail, { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Sair com segurança" }).click();

  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar no CRM" })
  ).toBeVisible();
});
