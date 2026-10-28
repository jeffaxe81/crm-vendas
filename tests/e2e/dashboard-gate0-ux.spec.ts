import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

import {
  finishInitialExperience,
  openWorkspaceSection,
} from "./helpers/workspace-navigation";

const api = "http://127.0.0.1:3001/api/v1";
const app = "http://127.0.0.1:3000";
const testCredential = ["dashboard", "gate0", "qa", "2026"].join("-");

type Session = {
  accessToken: string;
  organization: { id: string; name: string; slug: string };
};

async function registerTenant(
  request: APIRequestContext,
  label: string
): Promise<{ email: string; password: string; session: Session }> {
  const suffix = randomUUID();
  const email = `dashboard-gate0-${label}-${suffix}@example.test`;
  const organizationName = `Gate0 ${label} ${suffix}`;
  const registered = await request.post(`${api}/auth/register`, {
    data: {
      organizationName,
      adminDisplayName: `Gate0 ${label}`,
      adminEmail: email,
      adminPassword: testCredential,
    },
  });
  expect(registered.ok()).toBe(true);
  const session = (await registered.json()) as Session;
  return { email, password: testCredential, session };
}

async function login(page: Page, email: string, password: string) {
  await page.goto(app);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await expect(page.getByRole("main", { name: "Acesso ao CRM" })).toBeVisible();
}

async function seedCompanies(
  request: APIRequestContext,
  accessToken: string,
  count: number,
  prefix: string
) {
  for (let index = 0; index < count; index++) {
    const created = await request.post(`${api}/companies`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { legalName: `${prefix} ${index + 1}` },
    });
    expect(created.ok()).toBe(true);
  }
}

async function setLanguage(
  request: APIRequestContext,
  accessToken: string,
  defaultLanguage: "pt-BR" | "en" | "es"
) {
  const response = await request.put(`${api}/organization/language-settings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { defaultLanguage, detectBrowserLanguage: false },
  });
  expect(response.ok()).toBe(true);
}

async function openTranslatedVolume(
  page: Page,
  labels: {
    group: string;
    summary: string;
    volume: string;
    heading: string;
  }
) {
  const group = page.getByRole("button", { name: labels.group });
  await expect(group).toBeVisible();
  if ((await group.getAttribute("aria-expanded")) !== "true") {
    await group.click();
  }
  await page.getByRole("button", { name: labels.summary, exact: true }).click();
  await page.getByRole("tab", { name: labels.volume, exact: true }).click();
  await expect(
    page.getByRole("region", { name: labels.heading, exact: true })
  ).toBeVisible();
}

test("dashboard Gate 0 keeps desktop keyboard navigation accessible", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tenant = await registerTenant(request, "desktop");
  await login(page, tenant.email, tenant.password);
  await finishInitialExperience(page);

  await openWorkspaceSection(page, "Resumo gerencial");
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: "Volume de registros do CRM",
      exact: true,
    })
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);

  await page.reload();
  await expect(page.getByRole("main", { name: "Acesso ao CRM" })).toBeVisible();
  await page.evaluate(() => {
    // blur() leaves Chromium's sequential navigation starting point intact.
    // Focus the document start so Tab genuinely tests the first keyboard target.
    const previousTabIndex = document.body.getAttribute("tabindex");
    document.body.tabIndex = -1;
    document.body.focus();
    if (previousTabIndex === null) document.body.removeAttribute("tabindex");
    else document.body.setAttribute("tabindex", previousTabIndex);
  });
  await expect
    .poll(() => page.evaluate(() => document.activeElement === document.body))
    .toBe(true);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main", { name: "Acesso ao CRM" })).toBeFocused();
});

test("dashboard Gate 0 keeps the mobile drawer keyboard-safe", async ({
  page,
  request,
}) => {
  const tenant = await registerTenant(request, "mobile");
  await login(page, tenant.email, tenant.password);
  await finishInitialExperience(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const trigger = page.getByRole("button", { name: "Abrir navegação" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const navigation = page.getByRole("dialog", { name: "Navegação do CRM" });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Fechar navegação" })
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  const group = navigation.getByRole("button", { name: "Grupo Gestão" });
  if ((await group.getAttribute("aria-expanded")) !== "true") {
    await group.click();
  }
  await navigation
    .getByRole("button", { name: "Resumo gerencial", exact: true })
    .click();

  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();
  await expect(
    page.getByRole("region", {
      name: "Volume de registros do CRM",
      exact: true,
    })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("dashboard Gate 0 renders PT-BR EN and ES with the persisted tenant policy", async ({
  page,
  request,
}) => {
  const tenant = await registerTenant(request, "i18n");
  await login(page, tenant.email, tenant.password);
  await openWorkspaceSection(page, "Resumo gerencial");
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(
    page.getByRole("region", {
      name: "Volume de registros do CRM",
      exact: true,
    })
  ).toBeVisible();

  await setLanguage(request, tenant.session.accessToken, "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await openTranslatedVolume(page, {
    group: "Group Management",
    summary: "Management summary",
    volume: "Data volume",
    heading: "CRM record volume",
  });

  await setLanguage(request, tenant.session.accessToken, "es");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await openTranslatedVolume(page, {
    group: "Grupo Gestión",
    summary: "Resumen gerencial",
    volume: "Volumen de datos",
    heading: "Volumen de registros del CRM",
  });
});

test("dashboard Gate 0 does not flash the previous tenant during a session switch", async ({
  page,
  request,
}) => {
  const tenantA = await registerTenant(request, "tenant-a");
  const tenantB = await registerTenant(request, "tenant-b");
  await seedCompanies(
    request,
    tenantA.session.accessToken,
    1,
    "Tenant A company"
  );
  await seedCompanies(
    request,
    tenantB.session.accessToken,
    3,
    "Tenant B company"
  );

  await login(page, tenantA.email, tenantA.password);
  await openWorkspaceSection(page, "Resumo gerencial");
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();

  const panelA = page.getByRole("region", {
    name: "Volume de registros do CRM",
    exact: true,
  });
  await expect(
    panelA
      .locator("article")
      .filter({ hasText: "Empresas ativas" })
      .locator("strong")
  ).toHaveText("1");
  await expect(
    page.getByText(tenantA.session.organization.name, { exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Sair com segurança" }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await login(page, tenantB.email, tenantB.password);
  await finishInitialExperience(page);
  await expect(
    page.getByText(tenantA.session.organization.name, { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText(tenantB.session.organization.name, { exact: true })
  ).toBeVisible();

  await page.route(`${api}/dashboards/volume`, async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });

  await openWorkspaceSection(page, "Resumo gerencial");
  await page.getByRole("tab", { name: "Volume de dados", exact: true }).click();

  const panelB = page.getByRole("region", {
    name: "Volume de registros do CRM",
    exact: true,
  });
  await expect(
    panelB.getByText("Consultando volume de registros...")
  ).toBeVisible();
  await expect(panelB.getByText("Empresas ativas")).toHaveCount(0);
  await expect(
    panelB
      .locator("article")
      .filter({ hasText: "Empresas ativas" })
      .locator("strong")
  ).toHaveText("3");
  await page.unroute(`${api}/dashboards/volume`);
});
