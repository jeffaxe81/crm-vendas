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
export async function openWorkspaceSection(page: Page, label: string) {
  const group = page.getByRole("button", { name: `Grupo ${groups[label]}` });
  await expect(group).toBeVisible();
  if ((await group.getAttribute("aria-expanded")) !== "true")
    await group.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}
