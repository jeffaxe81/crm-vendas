export type TenantDataPolicy = {
  model: string;
  table: string;
  category: "IDENTITY" | "CONFIGURATION" | "OPERATIONAL" | "SECURITY";
  scope: "ORGANIZATION" | "ORGANIZATION_ROOT" | "REFERENCED_USERS";
  export: "FULL" | "PROJECTION" | "EXCLUDE";
  restore:
    | "REPLACE"
    | "REFERENCES"
    | "PRESERVE"
    | "PRESERVE_AND_REVOKE"
    | "PRESERVE_SUPERUSER"
    | "RENEW_EXPIRED_TOKEN"
    | "MERGE_HIGH_WATER";
  fields?: readonly string[];
};

function full(
  model: string,
  table: string,
  category: TenantDataPolicy["category"]
): TenantDataPolicy {
  return {
    model,
    table,
    category,
    scope: "ORGANIZATION",
    export: "FULL",
    restore: "REPLACE",
  };
}

/**
 * Explicit inventory, not a list inferred from client-supplied categories.
 * Schema coverage tests fail when a new persistent model has no reviewed policy.
 * A future snapshot reader must apply scope and projection before serialization;
 * a future restorer must implement each special policy before accepting a backup.
 */
export const TENANT_DATA_REGISTRY: readonly TenantDataPolicy[] = [
  ...[
    ["EmailOutbox", "email_outbox"],
    ["WebhookSubscription", "webhook_subscriptions"],
    ["WebhookDispatch", "webhook_dispatches"],
    ["WebhookDelivery", "webhook_deliveries"],
  ].map(([model, table]) => ({
    ...full(model!, table!, "SECURITY"),
    export: "EXCLUDE" as const,
    restore: "PRESERVE" as const,
  })),
  {
    ...full("BackupRecord", "backups", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE",
  },
  {
    ...full("DataOperation", "data_operations", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE",
  },
  {
    ...full("OperationPreview", "operation_previews", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE",
  },

  {
    ...full("BackupSchedule", "backup_schedules", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE",
  },
  {
    ...full("Organization", "organizations", "CONFIGURATION"),
    scope: "ORGANIZATION_ROOT",
  },
  full("Role", "roles", "CONFIGURATION"),
  full("RolePermission", "role_permissions", "CONFIGURATION"),
  {
    model: "User",
    table: "users",
    category: "IDENTITY",
    scope: "REFERENCED_USERS",
    export: "PROJECTION",
    restore: "REFERENCES",
    fields: ["id", "email", "displayName"],
  },
  {
    ...full("OrganizationMembership", "organization_memberships", "IDENTITY"),
    export: "PROJECTION",
    restore: "PRESERVE_SUPERUSER",
    fields: [
      "id",
      "organizationId",
      "userId",
      "role",
      "isActive",
      "createdAt",
      "updatedAt",
    ],
  },
  {
    ...full("RefreshSession", "refresh_sessions", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE_AND_REVOKE",
  },
  {
    ...full("AuditLog", "audit_logs", "SECURITY"),
    export: "EXCLUDE",
    restore: "PRESERVE",
  },
  full("Company", "companies", "OPERATIONAL"),
  full("Territory", "territories", "CONFIGURATION"),
  full("TerritoryQuota", "territory_quotas", "CONFIGURATION"),
  full("TerritoryTarget", "territory_targets", "OPERATIONAL"),
  full("TerritoryMetrics", "territory_metrics", "OPERATIONAL"),
  full("Contact", "contacts", "OPERATIONAL"),
  full("ContactChannel", "contact_channels", "OPERATIONAL"),
  full("CompanyContact", "company_contacts", "OPERATIONAL"),
  full("RelationshipEntry", "relationship_entries", "OPERATIONAL"),
  full("Tag", "tags", "CONFIGURATION"),
  full("CompanyTag", "company_tags", "OPERATIONAL"),
  full("ContactTag", "contact_tags", "OPERATIONAL"),
  full("CustomFieldDefinition", "custom_field_definitions", "CONFIGURATION"),
  full("CompanyCustomFieldValue", "company_custom_field_values", "OPERATIONAL"),
  full("ContactCustomFieldValue", "contact_custom_field_values", "OPERATIONAL"),
  full("Pipeline", "pipelines", "CONFIGURATION"),
  full("PipelineStage", "pipeline_stages", "CONFIGURATION"),
  full("Activity", "activities", "OPERATIONAL"),
  full("Opportunity", "opportunities", "OPERATIONAL"),
  full("Product", "products", "CONFIGURATION"),
  full("OpportunityItem", "opportunity_items", "OPERATIONAL"),
  full("Ticket", "tickets", "OPERATIONAL"),
  full("TicketEvent", "ticket_events", "OPERATIONAL"),
  {
    ...full(
      "TicketProtocolCounter",
      "ticket_protocol_counters",
      "CONFIGURATION"
    ),
    restore: "MERGE_HIGH_WATER",
  },
  full("SupportQueue", "support_queues", "CONFIGURATION"),
  full("SlaPolicy", "sla_policies", "CONFIGURATION"),
  {
    ...full(
      "TicketSatisfactionSurvey",
      "ticket_satisfaction_surveys",
      "OPERATIONAL"
    ),
    export: "PROJECTION",
    restore: "RENEW_EXPIRED_TOKEN",
    fields: [
      "id",
      "organizationId",
      "ticketId",
      "expiresAt",
      "rating",
      "comment",
      "respondedAt",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
      "version",
    ],
  },
  {
    ...full("IntegrationCredential", "integration_credentials", "SECURITY"),
    export: "PROJECTION",
    restore: "PRESERVE",
    fields: [
      "id",
      "organizationId",
      "name",
      "scopes",
      "isActive",
      "expiresAt",
      "createdAt",
      "createdBy",
      "revokedAt",
      "revokedBy",
    ],
  },
  full(
    "UserWorkspacePreference",
    "user_workspace_preferences",
    "CONFIGURATION"
  ),
];
