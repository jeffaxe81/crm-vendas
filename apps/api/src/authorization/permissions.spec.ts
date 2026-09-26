import { permissionsForRole, roleHasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows administrators to manage users, read audit and manage pipelines", () => {
    expect(roleHasPermission("ADMIN", "user.manage")).toBe(true);
    expect(roleHasPermission("ADMIN", "audit.read")).toBe(true);
    expect(roleHasPermission("ADMIN", "pipeline.manage")).toBe(true);
  });

  it("allows managers but not sellers to manage pipeline configuration", () => {
    expect(roleHasPermission("MANAGER", "pipeline.manage")).toBe(true);
    expect(roleHasPermission("SELLER", "pipeline.manage")).toBe(false);
  });

  it("keeps administrative permissions away from managers and sellers", () => {
    expect(roleHasPermission("MANAGER", "user.manage")).toBe(false);
    expect(roleHasPermission("SELLER", "audit.read")).toBe(false);
  });

  it("grants management reports only to administrators and managers", () => {
    expect(roleHasPermission("ADMIN", "reports.read")).toBe(true);
    expect(roleHasPermission("MANAGER", "reports.read")).toBe(true);
    expect(roleHasPermission("SELLER", "reports.read")).toBe(false);
    expect(roleHasPermission("VIEWER", "reports.read")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(permissionsForRole("VIEWER")).toContain("company.read");
    expect(roleHasPermission("VIEWER", "company.write")).toBe(false);
    expect(roleHasPermission("VIEWER", "pipeline.manage")).toBe(false);
  });
});

describe("C4.3 product permissions", () => {
  it("grants product.read to every role and product.write to ADMIN/MANAGER", () => {
    for (const role of ["ADMIN", "MANAGER", "SELLER", "VIEWER"] as const) {
      expect(roleHasPermission(role, "product.read")).toBe(true);
    }
    expect(roleHasPermission("ADMIN", "product.write")).toBe(true);
    expect(roleHasPermission("MANAGER", "product.write")).toBe(true);
    expect(roleHasPermission("SELLER", "product.write")).toBe(false);
    expect(roleHasPermission("VIEWER", "product.write")).toBe(false);
  });
});

describe("C4.1.6 territory permissions", () => {
  it("grants territory.read to every role", () => {
    for (const role of ["ADMIN", "MANAGER", "SELLER", "VIEWER"] as const) {
      expect(roleHasPermission(role, "territory.read")).toBe(true);
    }
  });

  it("grants territory.write to ADMIN, MANAGER and SELLER but not VIEWER", () => {
    expect(roleHasPermission("ADMIN", "territory.write")).toBe(true);
    expect(roleHasPermission("MANAGER", "territory.write")).toBe(true);
    expect(roleHasPermission("SELLER", "territory.write")).toBe(true);
    expect(roleHasPermission("VIEWER", "territory.write")).toBe(false);
  });
});
