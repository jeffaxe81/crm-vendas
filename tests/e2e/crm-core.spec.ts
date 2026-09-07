import { expect, test } from "@playwright/test";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const companyName = "Empresa E2E";
const contactName = "Contato E2E";
const contactEmail = "contato.e2e@example.test";
const relationshipNote = "Contato E2E interessado na proposta comercial.";

test("CRM core journey persists company contact channel link and history", async ({
  page,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");

  await page.goto("http://127.0.0.1:3000");

  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();

  await expect(
    page.getByRole("button", { name: "Nova empresa" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const companyForm = page.getByRole("form", { name: "Nova empresa" });
  await companyForm.getByLabel("Razão social").fill(companyName);
  await companyForm.getByLabel("Nome fantasia").fill(companyName);
  await companyForm.getByRole("button", { name: "Salvar empresa" }).click();
  await expect(
    page.getByText(companyName, { exact: true }).first()
  ).toBeVisible();

  await page.getByRole("button", { name: "Contatos" }).click();
  await expect(
    page.getByRole("button", { name: "Novo contato" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo contato" }).click();
  const contactForm = page.getByRole("form", { name: "Novo contato" });
  await contactForm.getByLabel("Nome completo").fill(contactName);
  await contactForm.getByLabel("Cargo").fill("Comprador E2E");
  await contactForm.getByRole("button", { name: "Salvar contato" }).click();

  const contactCard = page.locator("article").filter({ hasText: contactName });
  await expect(contactCard).toBeVisible();

  await contactCard.getByRole("button", { name: "Adicionar canal" }).click();
  const channelForm = page.getByRole("form", { name: "Novo canal" });
  await channelForm.getByLabel("Tipo").selectOption("EMAIL");
  await channelForm.getByLabel("Valor").fill(contactEmail);
  await channelForm.getByLabel("Rótulo").fill("E2E");
  await channelForm.getByLabel("Canal principal").check();
  await channelForm.getByRole("button", { name: "Salvar canal" }).click();
  await expect(contactCard.getByText(contactEmail)).toBeVisible();

  await contactCard.getByRole("button", { name: "Vincular empresa" }).click();
  const linkForm = page.getByRole("form", { name: "Vincular empresa" });
  await linkForm.getByLabel("Empresa").selectOption({ label: companyName });
  await linkForm.getByRole("button", { name: "Confirmar vínculo" }).click();

  await contactCard
    .getByRole("button", { name: "Registrar histórico" })
    .click();
  const historyForm = page.getByRole("form", {
    name: "Registrar histórico",
  });
  await historyForm.getByLabel("Tipo").selectOption("NOTE");
  await historyForm.getByLabel("Registro").fill(relationshipNote);
  await historyForm.getByRole("button", { name: "Salvar histórico" }).click();
  await expect(
    contactCard.getByText(relationshipNote, { exact: true })
  ).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "Contatos" })).toBeVisible();
  await page.getByRole("button", { name: "Contatos" }).click();

  const persistedCard = page
    .locator("article")
    .filter({ hasText: contactName });
  await expect(persistedCard).toBeVisible();
  await expect(persistedCard.getByText(contactEmail)).toBeVisible();
  await expect(
    persistedCard.getByText(relationshipNote, { exact: true })
  ).toBeVisible();
});
