import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { openWorkspaceSection } from "./helpers/workspace-navigation";

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@axes.test";
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

test("Knowledge Hub creates notes, links and documents and persists after reload", async ({
  page,
}) => {
  test.skip(!adminPassword, "BOOTSTRAP_ADMIN_PASSWORD is required for E2E.");
  const suffix = randomUUID().slice(0, 8);
  const noteTitle = `Nota ciclo C5 ${suffix}`;
  const linkTitle = `Link ciclo C5 ${suffix}`;
  const docTitle = `Documento ciclo C5 ${suffix}`;
  const contents = `Documento privado de teste ${suffix}`;

  await page.goto("http://127.0.0.1:3000");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword ?? "");
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await openWorkspaceSection(page, "Hub de conhecimento");

  await expect(
    page.getByRole("heading", { name: "Hub de conhecimento" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Novo registro" }).click();
  const editor = page.locator(".knowledge-hub__editor");
  await editor.getByLabel("Título").fill(noteTitle);
  await editor.getByLabel("Conteúdo da nota").fill("Registro criado via E2E.");
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("article").filter({ hasText: noteTitle })).toBeVisible();

  await page.getByRole("button", { name: "Novo registro" }).click();
  await editor.getByLabel("Tipo").selectOption("LINK");
  await editor.getByLabel("Título").fill(linkTitle);
  await editor
    .getByLabel("URL HTTP/HTTPS")
    .fill(`https://example.org/c5/${suffix}`);
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("article").filter({ hasText: linkTitle })).toBeVisible();

  await page.getByRole("button", { name: "Novo registro" }).click();
  await editor.getByLabel("Tipo").selectOption("DOCUMENT");
  await editor.getByLabel("Título").fill(docTitle);
  await editor.getByLabel("Arquivo (até 10 MiB)").setInputFiles({
    name: "evidencia-c5.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(contents),
  });
  await editor.getByRole("button", { name: "Salvar" }).click();
  await expect(page.locator("article").filter({ hasText: docTitle })).toBeVisible();

  // A reload must use the authenticated refresh flow, never local mock state.
  await page.reload();
  await openWorkspaceSection(page, "Hub de conhecimento");
  await expect(page.locator("article").filter({ hasText: noteTitle })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: linkTitle })).toBeVisible();
  const documentCard = page.locator("article").filter({ hasText: docTitle });
  await expect(documentCard).toBeVisible();

  const transfer = page.waitForEvent("download");
  await documentCard.getByRole("button", { name: "Baixar" }).click();
  const downloaded = await transfer;
  expect(downloaded.suggestedFilename()).toBe("evidencia-c5.txt");
  const filename = await downloaded.path();
  expect(filename).not.toBeNull();
  expect((await readFile(filename!)).toString()).toBe(contents);
});
