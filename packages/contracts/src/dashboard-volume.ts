import { z } from "zod";

export const DashboardMetricIdSchema = z.enum([
  "crm.companies.active",
  "crm.contacts.active",
  "crm.opportunities.active",
  "crm.activities.active",
]);

export const DashboardCatalogSchema = z.object({
  version: z.literal(1),
  metrics: z.array(
    z.object({
      id: DashboardMetricIdSchema,
      label: z.string().min(1),
      unit: z.literal("records"),
      permission: z.literal("reports.read"),
    })
  ),
});

export const DashboardVolumeSchema = z.object({
  asOf: z.string().datetime(),
  counts: z.object({
    companies: z.number().int().nonnegative(),
    contacts: z.number().int().nonnegative(),
    opportunities: z.number().int().nonnegative(),
    activities: z.number().int().nonnegative(),
  }),
  totalActiveRecords: z.number().int().nonnegative(),
  thresholds: z.object({
    warning: z.number().int().positive(),
    critical: z.number().int().positive(),
  }),
  level: z.enum(["normal", "warning", "critical"]),
  queryDurationMs: z.number().int().nonnegative(),
});

export type DashboardCatalog = z.infer<typeof DashboardCatalogSchema>;
export type DashboardVolume = z.infer<typeof DashboardVolumeSchema>;
export type DashboardMetricId = z.infer<typeof DashboardMetricIdSchema>;
