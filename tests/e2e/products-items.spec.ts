import { expect, test } from "@playwright/test";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const apiBaseUrl = "http://127.0.0.1:3001/api/v1";

const productCode = "LIC-E2E";
const productName = "Licença Produtos E2E";
const companyName = "Empresa Produtos E2E";
const opportunityTitle = "Oportunidade Produtos E2E";

test("CRM products journey adds edits and removes an opportunity item", async ({
  page,
  request,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");

  const apiLogin = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: adminEmail, password: adminPassword ?? "" },
  });
  expect(apiLogin.ok()).toBeTruthy();
  const apiSession = (await apiLogin.json()) as { accessToken: string };
  const pipelineResponse = await request.post(
    `${apiBaseUrl}/pipelines/default`,
    { headers: { Authorization: `Bearer ${apiSession.accessToken}` } }
  );
  expect(pipelineResponse.ok()).toBeTruthy();
  const pipeline = (await pipelineResponse.json()) as {
    name: string;
    stages: Array<{ id: string; name: string }>;
  };

  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();

  // Catálogo: cria o produto com preço em formato brasileiro.
  await page.getByRole("button", { name: "Produtos" }).click();
  await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
  await page.getByRole("button", { name: "Novo produto" }).click();
  const productForm = page.getByRole("form", { name: "Novo produto" });
  await productForm.getByLabel("Código").fill(productCode);
  await productForm.getByLabel("Nome").fill(productName);
  await productForm.getByLabel("Preço unitário").fill("1.500,00");
  await productForm.getByRole("button", { name: "Salvar produto" }).click();
  const productRow = page.getByRole("row").filter({ hasText: productCode });
  await expect(productRow).toBeVisible();
  await expect(productRow).toContainText(/1\.500,00/);

  // Cliente e oportunidade.
  await page.getByRole("button", { name: "Empresas" }).click();
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
  await opportunityForm
    .getByLabel("Cliente")
    .selectOption({ label: companyName });
  await opportunityForm
    .getByLabel("Funil")
    .selectOption({ label: pipeline.name });
  await opportunityForm
    .getByLabel("Etapa")
    .selectOption({ label: pipeline.stages[0].name });
  await opportunityForm.getByLabel("Valor estimado").fill("100.00");
  await opportunityForm
    .getByRole("button", { name: "Salvar oportunidade" })
    .click();

  const card = page.getByRole("listitem").filter({ hasText: opportunityTitle });
  await expect(card).toBeVisible();
  const estimatedValue = card
    .getByRole("definition")
    .filter({ hasText: "R$" })
    .first();
  await expect(estimatedValue).toContainText(/100,00/);

  // Adiciona o item com desconto: 2 × 1.500,00 − 10% = 2.700,00.
  await card.getByRole("button", { name: "Itens" }).click();
  const itemForm = card.getByRole("form", {
    name: `Adicionar item em ${opportunityTitle}`,
  });
  const productSelect = itemForm.getByLabel("Produto");
  await expect(
    productSelect.locator("option", { hasText: productCode })
  ).toHaveCount(1);
  await productSelect.selectOption({ index: 1 });
  await itemForm.getByLabel("Quantidade").fill("2");
  await itemForm.getByLabel("Desconto (%)").fill("10");
  await itemForm.getByRole("button", { name: "Adicionar item" }).click();

  const itemRow = card.getByRole("row").filter({ hasText: productName });
  await expect(itemRow).toContainText(/2\.700,00/);
  await expect(estimatedValue).toContainText(/2\.700,00/);

  // Edita a quantidade com vírgula decimal: 2,5 × 1.500,00 − 10% = 3.375,00.
  await card.getByRole("button", { name: `Editar ${productName}` }).click();
  await card.getByLabel(`Quantidade de ${productName}`).fill("2,5");
  await card.getByRole("button", { name: `Salvar ${productName}` }).click();
  await expect(card.getByLabel(`Quantidade de ${productName}`)).toHaveCount(0);
  await expect(itemRow).toContainText(/3\.375,00/);
  await expect(estimatedValue).toContainText(/3\.375,00/);

  // Remove o item: a soma vazia zera o valor.
  await card.getByRole("button", { name: `Remover ${productName}` }).click();
  await expect(itemRow).toHaveCount(0);
  await expect(estimatedValue).toHaveText(/^R\$\s0,00$/);
  await expect(card.getByText(/Nenhum item/)).toBeVisible();
});
