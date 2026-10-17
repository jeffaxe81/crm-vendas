import { jest } from "@jest/globals";

import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "../authorization/authenticated-request";
import { DashboardsController } from "./dashboards.controller";
import { DashboardsService } from "./dashboards.service";

const principal: AuthenticatedPrincipal = {
  userId: "user-1",
  organizationId: "tenant-one",
  membershipId: "member-1",
  role: "MANAGER",
  sessionId: "session-1",
  permissions: ["reports.read"],
  authMethod: "session",
  isSuperuser: false,
};

function requestFor(auth?: AuthenticatedPrincipal): AuthenticatedRequest {
  return { auth } as AuthenticatedRequest;
}

describe("Dashboard HTTP boundaries", () => {
  const readVolume = jest.fn().mockResolvedValue({ counts: {} });
  const controller = new DashboardsController({
    readVolume,
  } as unknown as DashboardsService);

  beforeEach(() => {
    readVolume.mockClear();
  });

  it("offers only the fixed catalogue to a human session", () => {
    const response = controller.readCatalog({}, requestFor(principal));
    expect(response.version).toBe(1);
    expect(response.metrics).toHaveLength(4);
    expect(response.metrics.map(metric => metric.id)).toEqual([
      "crm.companies.active",
      "crm.contacts.active",
      "crm.opportunities.active",
      "crm.activities.active",
    ]);
  });

  it("uses the authenticated tenant rather than a caller-supplied tenant", async () => {
    await controller.readVolume({}, requestFor(principal));
    expect(readVolume).toHaveBeenCalledWith("tenant-one");
  });

  it("blocks missing authentication, API keys and superusers", () => {
    expect(() => controller.readCatalog({}, requestFor())).toThrow();
    expect(() =>
      controller.readCatalog(
        {},
        requestFor({ ...principal, authMethod: "api_key" })
      )
    ).toThrow();
    expect(() =>
      controller.readCatalog(
        {},
        requestFor({ ...principal, isSuperuser: true })
      )
    ).toThrow();
    expect(readVolume).not.toHaveBeenCalled();
  });

  it("refuses tenant query overrides and malformed tenant IDs", () => {
    expect(() =>
      controller.readVolume(
        { organizationId: "other-tenant" },
        requestFor(principal)
      )
    ).toThrow();
    expect(() =>
      controller.readVolume(
        {},
        requestFor({ ...principal, organizationId: " tenant-one " })
      )
    ).toThrow();
    expect(readVolume).not.toHaveBeenCalled();
  });
});
