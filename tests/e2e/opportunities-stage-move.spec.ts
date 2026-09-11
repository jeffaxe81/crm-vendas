import { expect, test } from "@playwright/test";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const companyName = "Empresa Oportunidade E2E";
const opportunityTitle = "Oportunidade Movimentação E2E";

test("opportunity stage movement persists inside the current pipeline", async ({
  page,
  request,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");

  const loginResponse = await request.post(
    "http://127.0.0.1:3001/api/v1/auth/login",
    {
      data: {
        email: adminEmail,
        password: adminPassword ?? "",
        organizationSlug: "axesistemas",
      },
    }
  );
  expect(loginResponse.ok()).toBe(true);

  const session = (await loginResponse.json()) as { accessToken: string };
  const pipelineResponse = await request.post(
    "http://127.0.0.1:3001/api/v1/pipelines/default",
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    }
  );
  expect(pipelineResponse.ok()).toBe(true);

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

  await page.getByRole("button", { name: "Oportunidades" }).click();
  await expect(
    page.getByRole("heading", { name: "Oportunidades" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Nova oportunidade" }).click();
  const opportunityForm = page.getByRole("form", {
    name: "Nova oportunidade",
  });
  await opportunityForm.getByLabel("Título").fill(opportunityTitle);
  await opportunityForm.getByLabel("Cliente").selectOption({ label: companyName });
  await opportunityForm
    .getByLabel("Funil")
    .selectOption({ label: "Funil de Vendas" });
  await opportunityForm
    .getByLabel("Etapa")
    .selectOption({ label: "Prospecção" });
  await opportunityForm.getByLabel("Valor estimado").fill("15000.00");
  await opportunityForm
    .getByRole("button", { name: "Salvar oportunidade" })
    .click();

  const opportunityCard = page
    .locator("article")
    .filter({ hasText: opportunityTitle });
  await expect(opportunityCard).toBeVisible();

  const stageSelect = opportunityCard.getByLabel(
    `Etapa de ${opportunityTitle}`
  );
  await expect(stageSelect.locator("option:checked")).toHaveText("Prospecção");
  await stageSelect.selectOption({ label: "Qualificação" });
  await opportunityCard.getByRole("button", { name: "Mover etapa" }).click();
  await expect(stageSelect.locator("option:checked")).toHaveText("Qualificação");

  await page.reload();
  await expect(page.getByLabel("Acesso ao CRM")).toBeVisible();
  await page.getByRole("button", { name: "Oportunidades" }).click();

  const persistedCard = page
    .locator("article")
    .filter({ hasText: opportunityTitle });
  await expect(persistedCard).toBeVisible();
  await expect(
    persistedCard
      .getByLabel(`Etapa de ${opportunityTitle}`)
      .locator("option:checked")
  ).toHaveText("Qualificação");
});
