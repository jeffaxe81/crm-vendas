import { BackupError } from "./backup-error";
import type { TenantDataPolicy } from "./tenant-data-registry";

export type RestoreApplicationPlan = {
  organizationRoot: TenantDataPolicy;
  replaceModels: TenantDataPolicy[];
  referenceModels: TenantDataPolicy[];
  preserveSuperuserModels: TenantDataPolicy[];
  renewExpiredTokenModels: TenantDataPolicy[];
  mergeHighWaterModels: TenantDataPolicy[];
  preserveModels: TenantDataPolicy[];
  preserveAndRevokeModels: TenantDataPolicy[];
};

function unsupported(): never {
  throw new BackupError("RESTORE_POLICY_UNSUPPORTED");
}

export function buildRestoreApplicationPlan(
  policies: readonly TenantDataPolicy[]
): RestoreApplicationPlan {
  const exported = policies.filter(policy => policy.export !== "EXCLUDE");
  const organizationRoots = exported.filter(
    policy => policy.scope === "ORGANIZATION_ROOT"
  );

  if (
    organizationRoots.length !== 1 ||
    organizationRoots[0]?.model !== "Organization" ||
    organizationRoots[0].restore !== "REPLACE"
  ) {
    return unsupported();
  }

  const plan: RestoreApplicationPlan = {
    organizationRoot: organizationRoots[0],
    replaceModels: [],
    referenceModels: [],
    preserveSuperuserModels: [],
    renewExpiredTokenModels: [],
    mergeHighWaterModels: [],
    preserveModels: [],
    preserveAndRevokeModels: [],
  };

  for (const policy of exported) {
    if (policy === plan.organizationRoot) continue;

    switch (policy.restore) {
      case "REPLACE":
        if (policy.scope !== "ORGANIZATION") unsupported();
        plan.replaceModels.push(policy);
        break;
      case "REFERENCES":
        plan.referenceModels.push(policy);
        break;
      case "PRESERVE_SUPERUSER":
        plan.preserveSuperuserModels.push(policy);
        break;
      case "RENEW_EXPIRED_TOKEN":
        plan.renewExpiredTokenModels.push(policy);
        break;
      case "MERGE_HIGH_WATER":
        plan.mergeHighWaterModels.push(policy);
        break;
      case "PRESERVE":
        plan.preserveModels.push(policy);
        break;
      case "PRESERVE_AND_REVOKE":
        plan.preserveAndRevokeModels.push(policy);
        break;
      default:
        unsupported();
    }
  }

  return plan;
}
