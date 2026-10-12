import { expect, type Page } from "@playwright/test";
const groups: Record<string, string> = {
  Empresas: "Comercial",
  Contatos: "Comercial",
  Oportunidades: "Comercial",
  Produtos: "Comercial",
  Agenda: "Produtividade",
  Atividades: "Produtividade",
  Atendimento: "Atendimento",
  "Comunicação integrada": "Atendimento",
  "Resumo gerencial": "Gestão",
  "Chaves de integração": "Administração",
};
export async function finishInitialExperience(page: Page) {
  // Existing CRM E2E flows complete onboarding via the public UI rather than
  // force-clicking through the overlay or disabling the 1.1 feature.
  await expect(page.getByLabel("Sessão ativa")).toBeVisible();
  const wizard = page.getByRole("dialog", {
    name: "Configuração inicial da empresa",
  });
  const tour = page.getByRole("dialog", {
    name: "Tour das funcionalidades do CRM",
  });
  // The welcome panel is loaded asynchronously after session authentication.
  // A completed onboarding has no dialog; checking for a short bounded window
  // avoids racing the initial /me/onboarding fetch.
  await Promise.race([
    wizard.waitFor({ state: "visible", timeout: 1500 }).catch(() => {}),
    tour.waitFor({ state: "visible", timeout: 1500 }).catch(() => {}),
  ]);
  if (await wizard.isVisible()) {
    for (let stage = 1; stage < 4; stage++) {
      await wizard.getByRole("button", { name: "Salvar e continuar" }).click();
      await expect(wizard.getByText(`Etapa ${stage + 1} de 4`)).toBeVisible();
    }
    await wizard
      .getByRole("button", { name: "Concluir configuração e iniciar tour" })
      .click();
    await expect(wizard).toBeHidden();
  }
  if (await tour.isVisible()) {
    await tour.getByRole("button", { name: "Pular tour" }).click();
    await expect(tour).toBeHidden();
  }
}

export async function openWorkspaceSection(page: Page, label: string) {
  await finishInitialExperience(page);
  const group = page.getByRole("button", { name: `Grupo ${groups[label]}` });
  await expect(group).toBeVisible();
  if ((await group.getAttribute("aria-expanded")) !== "true")
    await group.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
