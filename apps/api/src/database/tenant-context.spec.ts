import { assertValidTenantContext } from "./prisma.service";

describe("Tenant context validation", () => {
  it.each([
    null,
    undefined,
    0,
    {},
    [],
    "",
    " ",
    " padded",
    "padded ",
    "tenant\ncontrol",
    "tenant\u0000null",
  ])("rejects invalid tenant IDs: %p", input => {
    expect(() => assertValidTenantContext(input)).toThrow(
      "INVALID_TENANT_CONTEXT"
    );
  });

  it.each([
    "10000000-0000-4000-8000-000000000001",
    "tenant-a",
    "tenant.with.text",
  ])("accepts valid UUID and textual tenant ID: %s", input => {
    expect(() => assertValidTenantContext(input)).not.toThrow();
  });
});
