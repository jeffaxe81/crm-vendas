import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrmShell } from "../crm-shell";
import { CompaniesView } from "./companies-view";

const session = {
  accessToken: "cycle-2-access-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@axes.test",
    displayName: "Administrador Axes",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN" as const,
  },
  permissions: ["company.read", "company.write", "contact.read", "contact.write"],
};

const initialCompany = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId: session.organization.id,
  legalName: "Empresa Inicial Ltda",
  tradeName: "Empresa Inicial",
  document: null,
  website: null,
  notes: null,
  version: 1,
  createdBy: session.user.id,
  updatedBy: session.user.id,
  deletedAt: null,
  deletedBy: null,
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cycle 2 CRM shell and companies view", () => {
  it("renders authenticated navigation for Empresas and Contatos", () => {
    render(
      <CrmShell
        session={session}
        activeSection="companies"
        onNavigate={() => undefined}
        onLogout={() => undefined}
      >
        <p>Conteúdo CRM</p>
      </CrmShell>
    );

    expect(screen.getByText("Axesistemas")).toBeInTheDocument();
    expect(screen.getByText("Administrador Axes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empresas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contatos" })).toBeInTheDocument();
    expect(screen.getByText("Conteúdo CRM")).toBeInTheDocument();
  });

  it("lists, searches, creates and edits companies through the API", async () => {
    const createdCompany = {
      ...initialCompany,
      id: "55555555-5555-4555-8555-555555555555",
      legalName: "Nova Empresa Ltda",
      tradeName: "Nova Empresa",
    };
    const updatedCompany = {
      ...initialCompany,
      legalName: "Empresa Inicial Atualizada Ltda",
      version: 2,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [initialCompany], page: 1, limit: 20, total: 1 })
      )
      .mockResolvedValueOnce(response(createdCompany, 201))
      .mockResolvedValueOnce(response(updatedCompany));
    vi.stubGlobal("fetch", fetchMock);

    render(<CompaniesView accessToken={session.accessToken} />);

    expect(screen.getByRole("searchbox", { name: "Buscar empresas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova empresa" })).toBeInTheDocument();
    expect(await screen.findByText("Empresa Inicial Ltda")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar empresas" }), {
      target: { value: "Inicial" },
    });
    expect(screen.getByText("Empresa Inicial Ltda")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    const createForm = screen.getByRole("form", { name: "Nova empresa" });
    fireEvent.change(within(createForm).getByLabelText("Razão social"), {
      target: { value: "Nova Empresa Ltda" },
    });
    fireEvent.change(within(createForm).getByLabelText("Nome fantasia"), {
      target: { value: "Nova Empresa" },
    });
    fireEvent.click(within(createForm).getByRole("button", { name: "Salvar empresa" }));

    expect(await screen.findByText("Nova Empresa Ltda")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/companies"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${session.accessToken}`,
        }),
      })
    );

    const initialRow = screen.getByText("Empresa Inicial Ltda").closest("article");
    expect(initialRow).not.toBeNull();
    fireEvent.click(within(initialRow as HTMLElement).getByRole("button", { name: "Editar" }));

    const editForm = screen.getByRole("form", { name: "Editar empresa" });
    fireEvent.change(within(editForm).getByLabelText("Razão social"), {
      target: { value: "Empresa Inicial Atualizada Ltda" },
    });
    fireEvent.click(within(editForm).getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText("Empresa Inicial Atualizada Ltda")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(`/companies/${initialCompany.id}`),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            Authorization: `Bearer ${session.accessToken}`,
          }),
        })
      );
    });
  });
});
