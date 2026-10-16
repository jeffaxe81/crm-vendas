import { describe, expect, it } from "vitest";
import { defaultBranding, TenantBrandingSchema } from "./index";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
describe("Tenant branding contract", () => {
  it("accepts defaults and a raster logo with independent colors", () => {
    expect(TenantBrandingSchema.parse(defaultBranding).logo).toBe("");
    expect(
      TenantBrandingSchema.parse({
        ...defaultBranding,
        logo: png,
        primaryColor: "#ABC123",
      }).logo
    ).toBe(png);
  });
  it.each([
    { logo: "https://tracking.example/logo.png" },
    { logo: "data:image/svg+xml;base64,PHN2Zz4=" },
    { logo: "data:image/png;base64,PHNjcmlwdD4=" },
    { logo: "data:image/png;base64," + "A".repeat(110000) },
    { primaryColor: "red;background:url(https://example.test)" },
    { menuColor: "#123" },
    { organizationId: "another-tenant" },
  ])("rejects unsafe or malformed branding %j", change => {
    expect(
      TenantBrandingSchema.safeParse({ ...defaultBranding, ...change }).success
    ).toBe(false);
  });
});
