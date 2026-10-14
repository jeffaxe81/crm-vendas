import type { AuthSessionResponse, QuickSetupState } from "@axes/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../lib/api-client";
import { QuickSetupExperience } from "./quick-setup-experience";

vi.mock("../../lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

const requestMock = vi.mocked(apiRequest);
const navigate = vi.fn();

const admin = {
  accessToken: "admin-quick-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.test",
    displayName: "Admin",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Empresa Demo",
    slug: "empresa-demo",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
  },
  permissions: [
    "organization.manage",
    "user.manage",
    "pipeline.manage",
    "reports.read",
    "product.write",
    "company.write",
    "contact.write",
  ],
} as AuthSessionResponse;

const viewer = {
  ...admin,
  accessToken: "viewer-quick-token",
  user: {
    ...admin.user,
    id: "44444444-4444-4444-8444-444444444444",
    displayName: "Viewer",
  },
  membership: { ...admin.membership, role: "VIEWER" },
  permissions: ["company.read", "contact.read"],
} as AuthSessionResponse;

const adminSteps: QuickSetupState["steps"] = [
  {
    id: "organization",
    title: "Organização",
    description: "Confirme a organização ativa.",
    destination: "home",
  },
  {
    id: "team",
    title: "Equipe e perfis",
    description: "Revise usuários e perfis.",
    destination: "admin-users",
  },
  {
    id: "sales-structure",
    title: "Estrutura comercial",
    description: "Revise pipeline, produtos e relatórios.",
    destination: "opportunities",
  },
  {
    id: "commercial-data",
    title: "Dados comerciais",
    description: "Prepare tags, campos, empresas e contatos.",
    destination: "companies",
  },
  {
    id: "help",
    title: "Ajuda por perfil",
    description: "Revise as orientações do seu perfil.",
    destination: "home",
  },
  {
    id: "review",
    title: "Validação final",
    description: "Confira o resumo.",
    destination: "home",
  },
];

const completedOnboarding = {
  organization: {
    eligible: false,
    completed: true,
    step: 4,
    name: "Empresa Demo",
  },
  tour: { status: "COMPLETED" },
};

beforeEach(() => {
  requestMock.mockReset();
  navigate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CRM 1.2 quick setup experience", () => {
  it("resumes server progress and guides an admin to permitted destinations", async () => {
    const initial: QuickSetupState = {
      completed: false,
      completedSteps: [],
      steps: adminSteps,
    };
    const progressed: QuickSetupState = {
      ...initial,
      completedSteps: ["organization"],
    };

    requestMock.mockImplementation(async (path, options) => {
      if (path === "/me/onboarding") return completedOnboarding as never;
      if (path === "/me/quick-setup") return initial as never;
      if (path === "/me/quick-setup/progress") {
        expect(options).toMatchObject({
          method: "POST",
          body: { stepId: "organization" },
        });
        return progressed as never;
      }
      throw new Error(`unexpected path: ${path}`);
    });

    render(
      <QuickSetupExperience
        session={admin}
        onNavigate={navigate}
        openToken={0}
      />
    );

    expect(
      await screen.findByRole("dialog", { name: "Configuração rápida do CRM" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organização" })).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Concluir etapa Organização" })
    );

    expect(
      await screen.findByRole("heading", { name: "Equipe e perfis" })
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir Equipe e perfis" })
    );
    expect(navigate).toHaveBeenCalledWith("admin-users");
  });

  it("uses backend-provided safe steps and contextual guidance for VIEWER", async () => {
    const state: QuickSetupState = {
      completed: false,
      completedSteps: [],
      steps: adminSteps.filter(step => ["help", "review"].includes(step.id)),
    };

    requestMock.mockImplementation(async path => {
      if (path === "/me/onboarding") return completedOnboarding as never;
      if (path === "/me/quick-setup") return state as never;
      throw new Error(`unexpected path: ${path}`);
    });

    render(
      <QuickSetupExperience
        session={viewer}
        onNavigate={navigate}
        openToken={0}
      />
    );

    expect(
      await screen.findByRole("dialog", { name: "Configuração rápida do CRM" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Perfil\s+VIEWER/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ajuda por perfil" })
    ).toBeVisible();
    expect(screen.queryByText("Equipe e perfis")).not.toBeInTheDocument();
    expect(screen.queryByText("Estrutura comercial")).not.toBeInTheDocument();
  });

  it("recovers after a failed load without changing progress", async () => {
    const state: QuickSetupState = {
      completed: false,
      completedSteps: [],
      steps: adminSteps,
    };

    requestMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(completedOnboarding as never)
      .mockResolvedValueOnce(state as never);

    render(
      <QuickSetupExperience
        session={admin}
        onNavigate={navigate}
        openToken={1}
      />
    );

    expect(
      await screen.findByRole("button", { name: "Tentar novamente" })
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Organização" })
      ).toBeInTheDocument()
    );
  });

  it("keeps automatic background load failures silent", async () => {
    requestMock.mockRejectedValueOnce(new Error("network unavailable"));

    render(
      <QuickSetupExperience
        session={admin}
        onNavigate={navigate}
        openToken={0}
      />
    );

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
