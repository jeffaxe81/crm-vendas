import type { Prisma } from "../generated/prisma/client";
import { BackupError } from "./backup-error";
import { snapshotFields } from "./backup-models";
import { isValidSnapshotField, type SnapshotData } from "./backup-manifest";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

export function prepareOrganizationRestore(
  data: SnapshotData,
  organizationId: string
) {
  const policy = TENANT_DATA_REGISTRY.find(
    item => item.model === "Organization"
  )!;
  const row = data.Organization?.[0];
  const fields = snapshotFields(policy);
  if (
    data.Organization?.length !== 1 ||
    row?.id !== organizationId ||
    Object.keys(row).length !== fields.length ||
    fields.some(field => !isValidSnapshotField(row[field.name], field)) ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.name.length > 160 ||
    !["pt-BR", "en", "es"].includes(String(row.defaultLanguage)) ||
    !Number.isInteger(row.onboardingStep) ||
    Number(row.onboardingStep) < 1 ||
    Number(row.onboardingStep) > 4
  ) {
    throw new BackupError("RESTORE_TARGET_INVALID");
  }
  if (row.branding !== null) {
    try {
      JSON.parse(String(row.branding));
    } catch {
      throw new BackupError("RESTORE_TARGET_INVALID");
    }
  }
  return row;
}

export async function validateOrganizationRestoreOwner(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
) {
  const row = prepareOrganizationRestore(data, organizationId);
  if (
    row.onboardingOwnerId !== null &&
    !(await tx.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: String(row.onboardingOwnerId),
        isActive: true,
        user: { isActive: true },
      },
      select: { id: true },
    }))
  )
    throw new BackupError("RESTORE_MEMBERSHIP_REFERENCE_MISSING");
}

/** Restore presentation/settings, never tenant identity, activation or credentials. */
export async function restoreOrganizationSettings(
  tx: Prisma.TransactionClient,
  organizationId: string,
  data: SnapshotData
) {
  const row = prepareOrganizationRestore(data, organizationId);
  const changed = await tx.$executeRawUnsafe(
    `UPDATE public.organizations SET name=$2, default_language=$3, detect_browser_language=$4,
      branding=$5::jsonb, onboarding_owner_id=$6::uuid, onboarding_step=$7,
      onboarding_completed_at=$8::timestamptz, updated_at=clock_timestamp()
     WHERE id=$1::uuid`,
    organizationId,
    row.name,
    row.defaultLanguage,
    row.detectBrowserLanguage,
    row.branding,
    row.onboardingOwnerId,
    row.onboardingStep,
    row.onboardingCompletedAt
  );
  if (changed !== 1) throw new BackupError("RESTORE_TARGET_INVALID");
}
