import { test, expect } from "@playwright/test";

test.beforeAll(() => {
  if (!process.env.QA_WEB_URL) throw new Error("Informe QA_WEB_URL explícita. Não use o fallback.");
  const url = new URL(process.env.QA_WEB_URL);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("TLS obrigatório fora de localhost.");
  }
});

test("WEB-02: tela de acesso apresenta login e campos em diferentes resoluções", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar no CRM" })).toBeVisible();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(horizontalOverflow, "Login sem rolagem horizontal").toBe(false);
  expect(errors, "Erros JS não tratados na tela de login").toEqual([]);
});

test("WEB-03: login/logout de conta sintética existente", async ({ page }) => {
  test.skip(!process.env.QA_TEST_EMAIL || !process.env.QA_TEST_PASSWORD, "Defina QA_TEST_EMAIL/QA_TEST_PASSWORD (somente conta sintética).");
  await page.goto("/");
  await page.getByLabel("E-mail").fill(process.env.QA_TEST_EMAIL!);
  await page.getByLabel("Senha").fill(process.env.QA_TEST_PASSWORD!);
  if (process.env.QA_TEST_TENANT) {
    await page.getByLabel("Identificador da empresa (opcional)").fill(process.env.QA_TEST_TENANT);
  }
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await expect(page.getByLabel("Sessão ativa")).toBeVisible();
  await page.getByRole("button", { name: "Sair com segurança" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
