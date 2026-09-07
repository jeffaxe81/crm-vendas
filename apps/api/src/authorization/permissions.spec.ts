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

  it("keeps viewers read-only", () => {
    expect(permissionsForRole("VIEWER")).toContain("company.read");
    expect(roleHasPermission("VIEWER", "company.write")).toBe(false);
  });
});
