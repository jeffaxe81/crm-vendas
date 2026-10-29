import { TENANT_DATA_REGISTRY } from "./tenant-data-registry";
import {
  REVIEWED_SPECIAL_RESTORE_POLICIES,
  unsupportedRestoreModels,
} from "./restore-executor";

describe("restore policy coverage", () => {
  it("supports every organization REPLACE model in the reviewed registry", () => {
    const replaceModels = TENANT_DATA_REGISTRY.filter(
      policy =>
        policy.scope === "ORGANIZATION" &&
        policy.export !== "EXCLUDE" &&
        policy.restore === "REPLACE"
    ).map(policy => policy.model);
    const counts = Object.fromEntries(replaceModels.map(model => [model, 1]));

    expect(unsupportedRestoreModels(counts, counts)).toEqual([]);
  });

  it("keeps every non-standard restore policy explicitly reviewed", () => {
    const expected = TENANT_DATA_REGISTRY.filter(
      policy =>
        policy.scope !== "ORGANIZATION" ||
        policy.export !== "FULL" ||
        policy.restore !== "REPLACE"
    )
      .map(
        policy =>
          policy.model +
          ":" +
          policy.scope +
          ":" +
          policy.export +
          ":" +
          policy.restore
      )
      .sort();

    expect([...REVIEWED_SPECIAL_RESTORE_POLICIES].sort()).toEqual(expected);
  });
});
