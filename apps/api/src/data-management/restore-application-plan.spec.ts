import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";
import { buildRestoreApplicationPlan } from "./restore-application-plan";

describe("restore application plan", () => {
  it("partitions every exported restore policy exactly once", () => {
    const plan = buildRestoreApplicationPlan(TENANT_DATA_REGISTRY);

    const exported = TENANT_DATA_REGISTRY.filter(
      policy => policy.export !== "EXCLUDE"
    ).map(policy => policy.model);

    const planned = [
      plan.organizationRoot.model,
      ...plan.replaceModels.map(policy => policy.model),
      ...plan.referenceModels.map(policy => policy.model),
      ...plan.preserveSuperuserModels.map(policy => policy.model),
      ...plan.renewExpiredTokenModels.map(policy => policy.model),
      ...plan.mergeHighWaterModels.map(policy => policy.model),
      ...plan.preserveModels.map(policy => policy.model),
    ];

    expect([...planned].sort()).toEqual([...exported].sort());
    expect(new Set(planned).size).toBe(planned.length);
  });

  it("never treats the organization root or referenced users as generic replacement", () => {
    const plan = buildRestoreApplicationPlan(TENANT_DATA_REGISTRY);

    expect(plan.organizationRoot.model).toBe("Organization");
    expect(plan.organizationRoot.scope).toBe("ORGANIZATION_ROOT");
    expect(plan.referenceModels.map(policy => policy.model)).toContain("User");
    expect(plan.replaceModels.map(policy => policy.model)).not.toContain(
      "Organization"
    );
    expect(plan.replaceModels.map(policy => policy.model)).not.toContain(
      "User"
    );
    expect(
      plan.replaceModels.every(
        policy =>
          policy.scope === "ORGANIZATION" && policy.restore === "REPLACE"
      )
    ).toBe(true);
  });

  it("fails closed for an unknown exported restore policy", () => {
    const policies = [
      ...TENANT_DATA_REGISTRY,
      {
        model: "FutureModel",
        table: "future_models",
        category: "OPERATIONAL" as const,
        scope: "ORGANIZATION" as const,
        export: "FULL" as const,
        restore: "UNREVIEWED" as never,
      },
    ];

    expect(() => buildRestoreApplicationPlan(policies)).toThrow(
      "RESTORE_POLICY_UNSUPPORTED"
    );
  });
});
