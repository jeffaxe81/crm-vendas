import type { MembershipRole } from "@axes/contracts";

export const PERMISSIONS = [
  "organization.manage",
  "user.manage",
  "audit.read",
  "reports.read",
  "pipeline.manage",
  "company.read",
  "company.write",
  "contact.read",
  "contact.write",
  "opportunity.read",
  "opportunity.write",
  "opportunity.move",
  "activity.read",
  "activity.write",
  "knowledge.read",
  "knowledge.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  "company.read",
  "contact.read",
  "opportunity.read",
  "activity.read",
  "knowledge.read",
];

const COMMERCIAL_WRITE: Permission[] = [
  ...READ_ONLY,
  "company.write",
  "contact.write",
  "opportunity.write",
  "opportunity.move",
  "activity.write",
  "knowledge.write",
];

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  ADMIN: [
    "organization.manage",
    "user.manage",
    "audit.read",
    "reports.read",
    "pipeline.manage",
    ...COMMERCIAL_WRITE,
  ],
  MANAGER: [...COMMERCIAL_WRITE, "pipeline.manage", "reports.read"],
  SELLER: COMMERCIAL_WRITE,
  VIEWER: READ_ONLY,
};

export function permissionsForRole(
  role: MembershipRole
): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(
  role: MembershipRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
