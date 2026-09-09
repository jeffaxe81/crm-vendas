import { permissionsForRole, roleHasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows administrators to manage users and read audit", () => {
    expect(roleHasPermission("ADMIN", "user.manage")).toBe(true);
    expect(roleHasPermission("ADMIN", "audit.read")).toBe(true);
  });

  it("keeps administrative permissions away from managers and sellers", () => {
    expect(roleHasPermission("MANAGER", "user.manage")).toBe(false);
    expect(roleHasPermission("SELLER", "audit.read")).toBe(false);
  });

  it("allows commercial roles to read and write pipelines and opportunities", () => {
    for (const role of ["ADMIN", "MANAGER", "SELLER"] as const) {
      expect(roleHasPermission(role, "pipeline.read")).toBe(true);
      expect(roleHasPermission(role, "pipeline.write")).toBe(true);
      expect(roleHasPermission(role, "opportunity.read")).toBe(true);
      expect(roleHasPermission(role, "opportunity.write")).toBe(true);
      expect(roleHasPermission(role, "opportunity.move")).toBe(true);
    }
  });

  it("keeps viewers read-only across companies, pipelines and opportunities", () => {
    expect(permissionsForRole("VIEWER")).toContain("company.read");
    expect(roleHasPermission("VIEWER", "company.write")).toBe(false);

    expect(roleHasPermission("VIEWER", "pipeline.read")).toBe(true);
    expect(roleHasPermission("VIEWER", "pipeline.write")).toBe(false);

    expect(roleHasPermission("VIEWER", "opportunity.read")).toBe(true);
    expect(roleHasPermission("VIEWER", "opportunity.write")).toBe(false);
    expect(roleHasPermission("VIEWER", "opportunity.move")).toBe(false);
  });
});
