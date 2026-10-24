import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { snapshotFields } from "./backup-models";
import { BackupError } from "./backup-error";
import { isValidSnapshotField, type SnapshotData } from "./backup-manifest";
import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";

const MODEL = "TicketSatisfactionSurvey";

type ProjectedSurveyRow = Record<string, unknown>;

function fail(): never {
  throw new BackupError("RESTORE_TARGET_INVALID");
}

function projectedRows(
  data: SnapshotData,
  organizationId: string
): ProjectedSurveyRow[] {
  const policy = TENANT_DATA_REGISTRY.find(item => item.model === MODEL);
  if (
    !policy ||
    policy.export !== "PROJECTION" ||
    policy.restore !== "RENEW_EXPIRED_TOKEN" ||
    policy.scope !== "ORGANIZATION"
  ) {
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  }

  const fields = snapshotFields(policy);
  if (
    fields.some(field => field.name === "tokenHash") ||
    fields.some(field => !["String", "DateTime", "Int"].includes(field.type))
  ) {
    throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
  }

  const source = data[MODEL];
  if (!Array.isArray(source)) fail();

  return source.map(row => {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      row.organizationId !== organizationId ||
      Object.keys(row).length !== fields.length ||
      fields.some(field => !Object.hasOwn(row, field.name))
    ) {
      return fail();
    }

    for (const field of fields) {
      if (!isValidSnapshotField(row[field.name], field)) fail();
    }

    const rating = row.rating;
    const respondedAt = row.respondedAt;
    const comment = row.comment;
    if (
      (rating === null) !== (respondedAt === null) ||
      (rating !== null &&
        (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)) ||
      (comment !== null &&
        (typeof comment !== "string" || comment.length > 2_000))
    ) {
      return fail();
    }

    return Object.fromEntries(
      fields.map(field => [field.dbName, row[field.name]])
    );
  });
}

/**
 * Read-only validation for the projected CSAT state. The public bearer hash
 * is deliberately absent from the snapshot and must never be accepted here.
 */
export function validateTicketSatisfactionRestore(
  data: SnapshotData,
  organizationId: string
): void {
  projectedRows(data, organizationId);
}

/**
 * Prepare replacement rows without resurrecting any historical bearer token.
 *
 * Responded surveys keep their historical expiry and response. Unanswered
 * surveys are restored no later than the restore instant, so the normal CSAT
 * flow reports them as expired until an authorized operator explicitly
 * generates and receives a new link.
 */
export function prepareTicketSatisfactionRestore(
  data: SnapshotData,
  organizationId: string,
  now: Date = new Date()
): ProjectedSurveyRow[] {
  return projectedRows(data, organizationId).map(row => {
    const respondedAt = row.responded_at;
    const snapshotExpiry = row.expires_at;
    if (typeof snapshotExpiry !== "string") fail();

    return {
      ...row,
      token_hash: randomBytes(32).toString("hex"),
      expires_at:
        respondedAt === null &&
        Date.parse(snapshotExpiry) > now.getTime()
          ? now.toISOString()
          : snapshotExpiry,
    };
  });
}

export async function deleteCurrentTicketSatisfactionSurveys(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  await tx.$executeRawUnsafe(
    `DELETE FROM "public"."ticket_satisfaction_surveys"
     WHERE "organization_id"=$1::uuid`,
    organizationId
  );
}

export async function insertTicketSatisfactionSurveys(
  tx: Prisma.TransactionClient,
  rows: ProjectedSurveyRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const inserted = await tx.$executeRawUnsafe(
    `INSERT INTO "public"."ticket_satisfaction_surveys"
      ("id","organization_id","ticket_id","expires_at","rating","comment",
       "responded_at","created_at","updated_at","created_by","updated_by",
       "version","token_hash")
     SELECT
       "id","organization_id","ticket_id","expires_at","rating","comment",
       "responded_at","created_at","updated_at","created_by","updated_by",
       "version","token_hash"
     FROM json_populate_recordset(
       NULL::"public"."ticket_satisfaction_surveys",
       $1::json
     )`,
    JSON.stringify(rows)
  );
  if (inserted !== rows.length) fail();
}
