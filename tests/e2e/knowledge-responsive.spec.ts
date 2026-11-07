import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openWorkspaceSection } from "./helpers/workspace-navigation";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

test("Knowledge Hub supports mobile navigation, keyboard escape, and desktop continuity", async ({
  page,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");
  test.setTimeout(60_000);
  const title = "Responsivo E2E " + randomUUID().slice(0, 8);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await openWorkspaceSection(page, "Hub de conhecimento");

  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", { name: "Abrir navegação" });
  await expect(open).toBeVisible();
  await open.click();
  const drawer = page.getByRole("dialog", { name: "Navegação do CRM" });
  await expect(drawer).toBeVisible();
  const group = drawer.getByRole("button", { name: "Grupo Conhecimento" });
  if ((await group.getAttribute("aria-expanded")) !== "true")
    await group.click();
  await drawer.getByRole("button", { name: "Hub de conhecimento" }).click();
  await expect(open).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Novo registro" }).click();
  const editor = page.locator(".knowledge-hub__editor");
  await editor.getByLabel("Título").fill(title);
  await editor.getByLabel("Conteúdo da nota").fill("Fluxo responsivo");
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(
    page.locator("article").filter({ hasText: title })
  ).toBeVisible();

  await open.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(
    page.getByRole("heading", { name: "Hub de conhecimento" })
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.locator("article").filter({ hasText: title })
  ).toBeVisible();
});
