import { describe, expect, it } from "vitest";

import {
  AuthSessionResponseSchema,
  LoginInputSchema,
  MembershipRoleSchema,
} from "./auth";

describe("authentication contracts", () => {
  it("normalizes and validates login input", () => {
    expect(
      LoginInputSchema.parse({
        email: "  Admin@Axesistemas.com.br ",
        password: "a-valid-password",
      })
    ).toEqual({
      email: "Admin@Axesistemas.com.br",
      password: "a-valid-password",
    });
  });

  it("accepts the four fixed MVP roles", () => {
    for (const role of ["ADMIN", "MANAGER", "SELLER", "VIEWER"]) {
      expect(MembershipRoleSchema.parse(role)).toBe(role);
    }
  });

  it("validates an authenticated session response", () => {
    expect(
      AuthSessionResponseSchema.parse({
        accessToken: "jwt",
        expiresIn: 900,
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "admin@axesistemas.com.br",
          displayName: "Administrador",
        },
        organization: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Axesistemas",
          slug: "axesistemas",
        },
        membership: {
          id: "33333333-3333-4333-8333-333333333333",
          role: "ADMIN",
        },
        permissions: ["user.manage", "audit.read"],
      })
    ).toMatchObject({
      expiresIn: 900,
      membership: { role: "ADMIN" },
    });
  });
});
