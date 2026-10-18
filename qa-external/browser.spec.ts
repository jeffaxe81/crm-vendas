import { test as base, expect } from "@playwright/test";
import { createBrowserGuard } from "./guards.mjs";

const test = base.extend<{ qaGuard: ReturnType<typeof createBrowserGuard> }>({
  qaGuard: [
    async ({ context }, use) => {
      const guard = createBrowserGuard(
        process.env.QA_WEB_URL,
        process.env.QA_API_URL
      );
      await context.route("**/*", guard.route);
      await use(guard);
      guard.assertSafe();
    },
    { auto: true },
  ],
});

test("WEB-02: tela de acesso apresenta login e campos em diferentes resoluções", async ({
  page,
  qaGuard,
}) => {
  let pageErrorCount = 0;
  page.on("pageerror", () => pageErrorCount++);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  qaGuard.assertSafe();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar no CRM" })
  ).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2
  );
  expect(horizontalOverflow, "Login sem rolagem horizontal").toBe(false);
  expect(pageErrorCount, "Quantidade de erros JS na tela de login").toBe(0);
});

test.describe("Conta sintética", () => {
  test("WEB-03: login/logout de conta sintética existente", async ({
    page,
    qaGuard,
  }) => {
    test.skip(
      !process.env.QA_TEST_EMAIL || !process.env.QA_TEST_PASSWORD,
      "Defina QA_TEST_EMAIL/QA_TEST_PASSWORD (somente conta sintética)."
    );
    await page.goto("/");
    qaGuard.assertSafe();
    await page.getByLabel("E-mail").fill(process.env.QA_TEST_EMAIL!);
    await page.getByLabel("Senha").fill(process.env.QA_TEST_PASSWORD!);
    if (process.env.QA_TEST_TENANT) {
      await page
        .getByLabel("Identificador da empresa (opcional)")
        .fill(process.env.QA_TEST_TENANT);
    }
    qaGuard.assertSafe();
    await page.getByRole("button", { name: "Entrar no CRM" }).click();
    await expect(page.getByLabel("Sessão ativa")).toBeVisible();
    await page.getByRole("button", { name: "Sair com segurança" }).click();
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  });
});
