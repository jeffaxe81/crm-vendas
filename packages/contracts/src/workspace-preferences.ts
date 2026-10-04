import { z } from "zod";

export const workspaceDestinations = [
  { id: "home", label: "Início", group: null, permission: null },
  {
    id: "companies",
    label: "Empresas",
    group: "Comercial",
    permission: "company.read",
  },
  {
    id: "contacts",
    label: "Contatos",
    group: "Comercial",
    permission: "contact.read",
  },
  {
    id: "opportunities",
    label: "Oportunidades",
    group: "Comercial",
    permission: "opportunity.read",
  },
  {
    id: "products",
    label: "Produtos",
    group: "Comercial",
    permission: "product.read",
  },
  {
    id: "agenda",
    label: "Agenda",
    group: "Produtividade",
    permission: "activity.read",
  },
  {
    id: "activities",
    label: "Atividades",
    group: "Produtividade",
    permission: "activity.read",
  },
  {
    id: "tickets",
    label: "Atendimento",
    group: "Atendimento",
    permission: "ticket.read",
  },
  {
    id: "communication",
    label: "Comunicação integrada",
    group: "Atendimento",
    permission: "ticket.read",
  },
  {
    id: "management-summary",
    label: "Resumo gerencial",
    group: "Gestão",
    permission: "reports.read",
  },
  {
    id: "territories",
    label: "Territórios",
    group: "Gestão",
    permission: "territory.read",
  },
  {
    id: "admin-users",
    label: "Usuários e perfis",
    group: "Administração",
    permission: "user.manage",
  },
  {
    id: "support-settings",
    label: "Configuração de atendimento",
    group: "Administração",
    permission: "support.manage",
  },
  {
    id: "workspace-settings",
    label: "Preferências pessoais",
    group: "Administração",
    permission: null,
  },
] as const;
export type WorkspaceSection = (typeof workspaceDestinations)[number]["id"];
const section = z.enum(
  workspaceDestinations.map(item => item.id) as [
    WorkspaceSection,
    ...WorkspaceSection[],
  ]
);
export const homeWidgetIds = ["favorites", "today", "indicators"] as const;
export const dashboardWidgetIds = [
  "value",
  "pending",
  "overdue",
  "undated",
  "stages",
  "sales",
] as const;
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
const homeIds = z
  .array(z.enum(homeWidgetIds))
  .refine(unique, "Componentes duplicados.");
const dashboardIds = z
  .array(z.enum(dashboardWidgetIds))
  .refine(unique, "Componentes duplicados.");
export const WorkspacePreferencesSchema = z
  .object({
    version: z.literal(1),
    defaultSection: section,
    favorites: z.array(section).max(6).refine(unique, "Favoritos duplicados."),
    homeOrder: homeIds.refine(
      value => value.length === homeWidgetIds.length,
      "Ordem incompleta."
    ),
    homeHidden: homeIds,
    dashboardOrder: dashboardIds.refine(
      value => value.length === dashboardWidgetIds.length,
      "Ordem incompleta."
    ),
    dashboardHidden: dashboardIds,
  })
  .strict();
export type WorkspacePreferences = z.infer<typeof WorkspacePreferencesSchema>;
export function createDefaultWorkspacePreferences(): WorkspacePreferences {
  return {
    version: 1,
    defaultSection: "home",
    favorites: [],
    homeOrder: [...homeWidgetIds],
    homeHidden: [],
    dashboardOrder: [...dashboardWidgetIds],
    dashboardHidden: [],
  };
}
export function availableWorkspaceDestinations(permissions: readonly string[]) {
  return workspaceDestinations.filter(
    item => !item.permission || permissions.includes(item.permission)
  );
}
export function sanitizeWorkspacePreferences(
  value: WorkspacePreferences,
  permissions: readonly string[]
): WorkspacePreferences {
  const permitted = new Set<WorkspaceSection>(
    availableWorkspaceDestinations(permissions).map(item => item.id)
  );
  return {
    ...value,
    defaultSection: permitted.has(value.defaultSection)
      ? value.defaultSection
      : "home",
    favorites: value.favorites.filter(id => permitted.has(id)),
  };
}
