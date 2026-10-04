import { describe, expect, it } from "vitest";
import {
  WorkspacePreferencesSchema,
  sanitizeWorkspacePreferences,
  createDefaultWorkspacePreferences,
} from "./workspace-preferences";
describe("Workspace preferences", () => {
  it("removes revoked destinations and resets a forbidden default", () => {
    const value = {
      ...createDefaultWorkspacePreferences(),
      defaultSection: "admin-users" as const,
      favorites: ["companies", "admin-users"] as (
        "companies" | "admin-users"
      )[],
    };
    expect(sanitizeWorkspacePreferences(value, ["company.read"])).toEqual({
      ...value,
      defaultSection: "home",
      favorites: ["companies"],
    });
  });
  it("defaults to home with unique complete component orders", () => {
    const value = createDefaultWorkspacePreferences();
    expect(value.defaultSection).toBe("home");
    expect(value.favorites).toEqual([]);
    expect(value.homeOrder).toHaveLength(3);
    expect(value.dashboardOrder).toHaveLength(6);
    expect(WorkspacePreferencesSchema.parse(value)).toEqual(value);
  });
  it.each([
    { favorites: ["companies", "companies"] },
    {
      favorites: [
        "companies",
        "contacts",
        "activities",
        "agenda",
        "products",
        "tickets",
        "communication",
      ],
    },
    { defaultSection: "unknown" },
    { userId: "other" },
    { homeOrder: ["favorites", "favorites", "today"] },
    { dashboardOrder: ["value"] },
    { dashboardHidden: ["unknown"] },
    { homeHidden: ["today", "today"] },
    { version: 2 },
  ])("rejects malformed preferences %j", patch => {
    expect(
      WorkspacePreferencesSchema.safeParse({
        ...createDefaultWorkspacePreferences(),
        ...patch,
      }).success
    ).toBe(false);
  });
});
