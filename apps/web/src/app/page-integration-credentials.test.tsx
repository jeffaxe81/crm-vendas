import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkspacePreferences } from "@axes/contracts";
import Home from "./page";
import { openNavigationGroup } from "./test-utils/workspace-navigation";

const session = {
  accessToken: "admin-session",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.test",
    displayName: "Administrador",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" },
  permissions: ["integration.read", "integration.manage", "company.read"],
};
const credential = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "ERP de teste",
  keyPrefix: "axe_live_example",
  scopes: ["company.read"],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: "2026-10-09T09:00:00.000Z",
  revokedAt: null,
};

function response(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function mount(
  permissions = session.permissions,
  handleCredentialRequest: (
    init?: RequestInit
  ) => Response | Promise<Response> = () => response([credential])
) {
  const requests: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/refresh"))
        return response({ ...session, permissions });
      if (path.endsWith("/auth/logout")) return response(undefined, 204);
      if (path.endsWith("/workspace-preferences"))
        return response(createDefaultWorkspacePreferences());
      if (path.includes("/integrations/credentials")) {
        requests.push({ path, init });
        return handleCredentialRequest(init);
      }
      return response({ items: [], page: 1, limit: 20, total: 0 });
    })
  );
  render(<Home />);
  return requests;
}

async function openCredentials() {
  await openNavigationGroup("Administração");
  fireEvent.click(screen.getByRole("button", { name: "Chaves de integração" }));
  await screen.findByRole("heading", { name: "Chaves de integração" });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe("C6 integration credential administration", () => {
  it("lists the organization credentials through the existing authenticated API", async () => {
    const requests = mount();
    await openCredentials();
    expect(await screen.findByText("ERP de teste")).toBeInTheDocument();
    expect(screen.getByText("axe_live_example")).toBeInTheDocument();
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer admin-session",
    });
  });

  it("does not expose credentials or query their API without integration.read", async () => {
    const requests = mount(["company.read"]);
    await openNavigationGroup("Administração");
    expect(
      screen.queryByRole("button", { name: "Chaves de integração" })
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("keeps the list read-only without integration.manage", async () => {
    mount(["integration.read", "company.read"]);
    await openCredentials();
    await screen.findByText("ERP de teste");
    expect(
      screen.queryByRole("button", { name: "Criar chave" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revogar ERP de teste" })
    ).not.toBeInTheDocument();
  });

  it("creates a scoped key, reveals it once, and clears it on explicit dismissal and later navigation", async () => {
    const secret = "axe_live_generated_example_only";
    const requests = mount(undefined, init =>
      init?.method === "POST"
        ? response({ ...credential, name: "ERP novo", plainKey: secret }, 201)
        : response([credential])
    );
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP novo" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    expect(await screen.findByLabelText("Chave de API")).toHaveTextContent(
      secret
    );
    expect(
      screen.queryByRole("button", { name: "Criar chave" })
    ).not.toBeInTheDocument();
    const create = requests.find(request => request.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({
      name: "ERP novo",
      scopes: ["company.read"],
    });
    expect(Object.values(localStorage).join(" ")).not.toContain(secret);
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Já guardei a chave" }));
    expect(screen.queryByLabelText("Chave de API")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar chave" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP novo" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    await screen.findByLabelText("Chave de API");
    fireEvent.click(screen.getByRole("button", { name: "Início" }));
    await openCredentials();
    await screen.findByText("ERP de teste");
    expect(screen.queryByLabelText("Chave de API")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
  });

  it("offers only published public API scopes that the current session can grant", async () => {
    mount();
    await openCredentials();
    await screen.findByText("ERP de teste");
    expect(screen.getByLabelText("Consultar empresas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alterar empresas")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Administrar integrações")
    ).not.toBeInTheDocument();
  });

  it("requires a confirmation before revoking and marks the key as revoked after success", async () => {
    let revoked = false;
    const requests = mount(undefined, init => {
      if (init?.method === "DELETE") {
        revoked = true;
        return response(undefined, 204);
      }
      return response([
        {
          ...credential,
          isActive: !revoked,
          revokedAt: revoked ? "2026-10-09T10:00:00.000Z" : null,
        },
      ]);
    });
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.click(
      screen.getByRole("button", { name: "Revogar ERP de teste" })
    );
    expect(requests.some(request => request.init?.method === "DELETE")).toBe(
      false
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar revogação" })
    );
    expect(await screen.findByText("Revogada")).toBeInTheDocument();
    expect(
      requests.find(request => request.init?.method === "DELETE")?.path
    ).toBe(`/api/v1/integrations/credentials/${credential.id}`);
    expect(
      screen.queryByRole("button", { name: "Revogar ERP de teste" })
    ).not.toBeInTheDocument();
  });

  it("recovers a failed listing when the operator retries", async () => {
    let available = false;
    mount(undefined, () =>
      available
        ? response([credential])
        : response({ message: "Serviço indisponível." }, 503)
    );
    await openCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Serviço indisponível."
    );
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("ERP de teste")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a failed revocation visible without pretending the key was revoked", async () => {
    mount(undefined, init =>
      init?.method === "DELETE"
        ? response({ message: "Revogação indisponível." }, 503)
        : response([credential])
    );
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.click(
      screen.getByRole("button", { name: "Revogar ERP de teste" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar revogação" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Revogação indisponível."
    );
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.queryByText("Revogada")).not.toBeInTheDocument();
  });

  it("validates the selected scope before creating a key", async () => {
    const requests = mount();
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP novo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecione ao menos uma permissão."
    );
    expect(requests.some(request => request.init?.method === "POST")).toBe(
      false
    );
  });

  it("sends an optional future expiration in the API's UTC format", async () => {
    const requests = mount(undefined, init =>
      init?.method === "POST"
        ? response({ ...credential, plainKey: "axe_live_example_only" }, 201)
        : response([credential])
    );
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP temporário" },
    });
    fireEvent.change(screen.getByLabelText("Expiração (opcional)"), {
      target: { value: "2027-12-31T18:00" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    await screen.findByLabelText("Chave de API");
    const create = requests.find(request => request.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body)).expiresAt).toBe(
      new Date("2027-12-31T18:00").toISOString()
    );
  });

  it("does not create an already expired key", async () => {
    const requests = mount();
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP temporário" },
    });
    fireEvent.change(screen.getByLabelText("Expiração (opcional)"), {
      target: { value: "2020-01-01T00:00" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe uma data de expiração futura."
    );
    expect(requests.some(request => request.init?.method === "POST")).toBe(
      false
    );
  });

  it("preserves the created key when clipboard access is unavailable", async () => {
    const secret = "axe_live_example_copy_only";
    mount(undefined, init =>
      init?.method === "POST"
        ? response({ ...credential, plainKey: secret }, 201)
        : response([credential])
    );
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP novo" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    await screen.findByLabelText("Chave de API");
    fireEvent.click(screen.getByRole("button", { name: "Copiar chave" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "copie manualmente"
    );
    expect(screen.getByLabelText("Chave de API")).toHaveTextContent(secret);
  });

  it("clears the displayed key when the CRM session ends", async () => {
    const secret = "axe_live_logout_example_only";
    mount(undefined, init =>
      init?.method === "POST"
        ? response({ ...credential, plainKey: secret }, 201)
        : response([credential])
    );
    await openCredentials();
    await screen.findByText("ERP de teste");
    fireEvent.change(screen.getByLabelText("Nome da integração"), {
      target: { value: "ERP novo" },
    });
    fireEvent.click(screen.getByLabelText("Consultar empresas"));
    fireEvent.click(screen.getByRole("button", { name: "Criar chave" }));
    await screen.findByLabelText("Chave de API");
    fireEvent.click(screen.getByRole("button", { name: "Sair com segurança" }));
    await screen.findByRole("heading", { name: "Entrar" });
    expect(screen.queryByLabelText("Chave de API")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
  });
});
