import type { Permission } from "../authorization/permissions";

/** Closed catalogue: clients cannot supply expressions, SQL or dimensions. */
export const DASHBOARD_METRICS = [
  {
    id: "crm.companies.active",
    label: "Empresas ativas",
    unit: "records",
    permission: "reports.read",
  },
  {
    id: "crm.contacts.active",
    label: "Contatos ativos",
    unit: "records",
    permission: "reports.read",
  },
  {
    id: "crm.opportunities.active",
    label: "Oportunidades ativas",
    unit: "records",
    permission: "reports.read",
  },
  {
    id: "crm.activities.active",
    label: "Atividades ativas",
    unit: "records",
    permission: "reports.read",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  unit: "records";
  permission: Permission;
}>;

export function dashboardCatalog() {
  return { version: 1, metrics: DASHBOARD_METRICS };
}
