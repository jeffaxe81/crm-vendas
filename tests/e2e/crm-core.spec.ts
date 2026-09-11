import { expect, test } from "@playwright/test";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const companyName = "Empresa E2E";
const contactName = "Contato E2E";
const contactEmail = "contato.e2e@example.test";
const relationshipNote = "Contato E2E interessado na proposta comercial.";
const activityName = "Follow-up E2E";
const opportunityCompanyName = "Empresa Oportunidade E2E";
const opportunityTitle = "Oportunidade E2E";

const apiBaseUrl = "http://127.0.0.1:3001/api/v1";

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

  await expect(page.getByLabel("Acesso ao CRM")).toBeVisible();
  await expect(
    page.getByText(companyName, { exact: true }).first()
  ).toBeVisible();
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

test("CRM activities journey creates completes and persists an activity", async ({
  page,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");

  await page.goto("http://127.0.0.1:3000");

  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();

  await page.getByRole("button", { name: "Atividades" }).click();
  await expect(
    page.getByRole("heading", { name: "Atividades e compromissos" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Nova atividade" }).click();
  const activityForm = page.getByRole("form", { name: "Nova atividade" });
  await activityForm.getByLabel("Título").fill(activityName);
  await activityForm.getByRole("button", { name: "Salvar atividade" }).click();

  const pendingActivity = page
    .getByRole("listitem")
    .filter({ hasText: activityName });
  await expect(pendingActivity).toBeVisible();
  await pendingActivity.getByRole("button", { name: "Concluir" }).click();
  await expect(pendingActivity).not.toBeVisible();

  await page.getByRole("button", { name: "Concluídas" }).click();
  const completedActivity = page
    .getByRole("listitem")
    .filter({ hasText: activityName });
  await expect(completedActivity).toBeVisible();
  await expect(
    completedActivity.getByRole("button", { name: "Reabrir" })
  ).toBeVisible();
});

test("CRM opportunity journey creates moves and persists a stage change", async ({
  page,
  request,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");

  const apiLogin = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email: adminEmail,
      password: adminPassword ?? "",
    },
  });
  expect(apiLogin.ok()).toBeTruthy();

  const apiSession = (await apiLogin.json()) as { accessToken: string };
  const pipelineResponse = await request.post(`${apiBaseUrl}/pipelines/default`, {
    headers: {
      Authorization: `Bearer ${apiSession.accessToken}`,
    },
  });
  expect(pipelineResponse.ok()).toBeTruthy();

  const pipeline = (await pipelineResponse.json()) as {
    name: string;
    stages: Array<{ id: string; name: string }>;
  };
  expect(pipeline.stages.length).toBeGreaterThanOrEqual(2);

  const initialStage = pipeline.stages[0];
  const targetStage = pipeline.stages[1];

  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();

  await expect(
    page.getByRole("button", { name: "Nova empresa" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const companyForm = page.getByRole("form", { name: "Nova empresa" });
  await companyForm.getByLabel("Razão social").fill(opportunityCompanyName);
  await companyForm.getByLabel("Nome fantasia").fill(opportunityCompanyName);
  await companyForm.getByRole("button", { name: "Salvar empresa" }).click();
  await expect(
    page.getByText(opportunityCompanyName, { exact: true }).first()
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
  await opportunityForm
    .getByLabel("Cliente")
    .selectOption({ label: opportunityCompanyName });
  await opportunityForm.getByLabel("Funil").selectOption({ label: pipeline.name });
  await opportunityForm
    .getByLabel("Etapa")
    .selectOption({ label: initialStage.name });
  await opportunityForm.getByLabel("Valor estimado").fill("2500.00");
  await opportunityForm
    .getByRole("button", { name: "Salvar oportunidade" })
    .click();

  const opportunityCard = page
    .getByRole("listitem")
    .filter({ hasText: opportunityTitle });
  await expect(opportunityCard).toBeVisible();

  const stageSelect = opportunityCard.getByRole("combobox", {
    name: `Etapa de ${opportunityTitle}`,
  });
  await expect(stageSelect).toHaveValue(initialStage.id);
  await stageSelect.selectOption(targetStage.id);
  await opportunityCard.getByRole("button", { name: "Mover etapa" }).click();
  await expect(stageSelect).toHaveValue(targetStage.id);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Oportunidades" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Oportunidades" }).click();

  const persistedOpportunityCard = page
    .getByRole("listitem")
    .filter({ hasText: opportunityTitle });
  await expect(persistedOpportunityCard).toBeVisible();
  await expect(
    persistedOpportunityCard.getByRole("combobox", {
      name: `Etapa de ${opportunityTitle}`,
    })
  ).toHaveValue(targetStage.id);
});
