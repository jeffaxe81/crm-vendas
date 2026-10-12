import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSessionResponse } from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
import { FirstAccessExperience } from "./first-access-experience";

vi.mock("../../lib/api-client", () => ({
  apiRequest: vi.fn(),
}));
const requestMock = vi.mocked(apiRequest);

const admin: AuthSessionResponse = {
  accessToken: "admin-token",
  expiresIn: 900,
  user: {
    id: "9cb82d6b-1c88-44da-87b2-34197b46faf0",
    email: "admin@example.test",
    displayName: "Admin",
  },
  organization: {
    id: "54fb1c5c-5fd4-45ba-a8e1-49fd1134b2a4",
    name: "Empresa Demo",
    slug: "empresa-demo",
  },
  membership: {
    id: "0a01fd1c-eb59-487f-97c7-4342c2fce519",
    role: "ADMIN",
  },
  permissions: [
    "organization.manage",
    "user.manage",
    "integration.read",
    "company.read",
    "contact.read",
    "opportunity.read",
  ],
};
const viewer: AuthSessionResponse = {
  ...admin,
  accessToken: "viewer-token",
  user: { ...admin.user, id: "c58f3f71-5968-4abf-8609-a56c768e1289" },
  membership: { ...admin.membership, role: "VIEWER" },
  permissions: ["company.read", "contact.read"],
};
const navigation = vi.fn();
const renamed = vi.fn();

beforeEach(() => {
  requestMock.mockReset();
  navigation.mockReset();
  renamed.mockReset();
});

describe("CRM 1.1 first access UX", () => {
  it("shows wizard only to the founding admin, then launches their tour", async () => {
    requestMock.mockImplementation(async (path, options) => {
      if (path === "/me/onboarding") {
        return {
          organization: {
            eligible: true,
            completed: false,
            step: 1,
            name: "Empresa Demo",
          },
          tour: { status: "PENDING" },
        } as never;
      }
      if (path === "/me/onboarding/organization") {
        const input = options?.body as { step: number; name?: string; complete?: boolean };
        return {
          eligible: true,
          completed: Boolean(input.complete),
          step: input.step,
          name: input.name || "Empresa Demo",
        } as never;
      }
      return { status: "COMPLETED" } as never;
    });
    render(
      <FirstAccessExperience
        session={admin}
        onNavigate={navigation}
        replayToken={0}
        onOrganizationNameChange={renamed}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Configuração inicial da empresa" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da organização na configuração inicial"), {
      target: { value: "Empresa Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await waitFor(() => expect(renamed).toHaveBeenCalledWith("Empresa Nova"));
    await screen.findByText("Usuários e permissões");
    fireEvent.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await screen.findByText("Área comercial e preferências");
    fireEvent.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await screen.findByText("Integrações e conclusão");
    fireEvent.click(screen.getByRole("button", { name: "Concluir configuração e iniciar tour" }));
    expect(
      await screen.findByRole("dialog", { name: "Tour das funcionalidades do CRM" })
    ).toBeInTheDocument();
    expect(navigation).toHaveBeenCalledWith("home");
  });

  it("starts on first login for each non-admin and hides unauthorized modules", async () => {
    requestMock.mockImplementation(async path =>
      path === "/me/onboarding"
        ? ({
            organization: { eligible: false, completed: false, step: 1, name: "Empresa Demo" },
            tour: { status: "PENDING" },
          } as never)
        : ({ status: "SKIPPED" } as never)
    );
    render(
      <FirstAccessExperience
        session={viewer}
        onNavigate={navigation}
        replayToken={0}
        onOrganizationNameChange={renamed}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Tour das funcionalidades do CRM" })
    ).toBeInTheDocument();
    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    expect(screen.queryByText("Usuários e permissões")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(navigation).toHaveBeenCalledWith("companies");
    fireEvent.click(screen.getByRole("button", { name: "Pular tour" }));
    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith(
        "/me/onboarding/tour",
        expect.objectContaining({ body: { status: "SKIPPED" } })
      )
    );
  });

  it("does not automatically replay a completed tour but allows explicit replay", async () => {
    requestMock.mockResolvedValue({
      organization: { eligible: false, completed: true, step: 4, name: "Empresa Demo" },
      tour: { status: "COMPLETED" },
    } as never);
    const { rerender } = render(
      <FirstAccessExperience
        session={viewer}
        onNavigate={navigation}
        replayToken={0}
        onOrganizationNameChange={renamed}
      />
    );
    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <FirstAccessExperience
        session={viewer}
        onNavigate={navigation}
        replayToken={1}
        onOrganizationNameChange={renamed}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Tour das funcionalidades do CRM" })
    ).toBeInTheDocument();
  });
});
