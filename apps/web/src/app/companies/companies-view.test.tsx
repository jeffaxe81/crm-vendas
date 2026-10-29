import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  permissions: [
    "company.read",
    "company.write",
    "contact.read",
    "contact.write",
  ],
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
  cleanup();
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
    expect(
      screen.getByRole("button", { name: "Empresas" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contatos" })
    ).toBeInTheDocument();
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

    expect(
      screen.getByRole("searchbox", { name: "Buscar empresas" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nova empresa" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Empresa Inicial Ltda")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar empresas" }),
      {
        target: { value: "Inicial" },
      }
    );
    expect(screen.getByText("Empresa Inicial Ltda")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    const createForm = screen.getByRole("form", { name: "Nova empresa" });
    fireEvent.change(within(createForm).getByLabelText("Razão social"), {
      target: { value: "Nova Empresa Ltda" },
    });
    fireEvent.change(within(createForm).getByLabelText("Nome fantasia"), {
      target: { value: "Nova Empresa" },
    });
    fireEvent.click(
      within(createForm).getByRole("button", { name: "Salvar empresa" })
    );

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

    const initialRow = screen
      .getByText("Empresa Inicial Ltda")
      .closest("article");
    expect(initialRow).not.toBeNull();
    fireEvent.click(
      within(initialRow as HTMLElement).getByRole("button", { name: "Editar" })
    );

    const editForm = screen.getByRole("form", { name: "Editar empresa" });
    fireEvent.change(within(editForm).getByLabelText("Razão social"), {
      target: { value: "Empresa Inicial Atualizada Ltda" },
    });
    fireEvent.click(
      within(editForm).getByRole("button", { name: "Salvar alterações" })
    );

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

it("loads the next companies page, preserving filters and avoiding duplicate cards", async () => {
  const first = Array.from({ length: 20 }, (_, i) => ({
    ...initialCompany,
    id: `company-${i}`,
    legalName: `Empresa ${i}`,
  }));
  const next = {
    ...initialCompany,
    id: "company-20",
    legalName: "Empresa posterior",
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({ items: first, page: 1, limit: 20, total: 21 })
    )
    .mockResolvedValueOnce(
      response({ items: [first[19], next], page: 2, limit: 20, total: 21 })
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<CompaniesView accessToken="reader-token" canWrite={false} />);
  await screen.findByText("Empresa 0");
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar empresas" }), {
    target: { value: "posterior" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais empresas" })
  );
  expect(await screen.findByText("Empresa posterior")).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue("posterior");
  expect(screen.getByText("1 de 21 empresas carregadas")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Carregar mais empresas" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Nova empresa" })
  ).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining("page=2&limit=20"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer reader-token",
      }),
    })
  );
});

it("keeps loaded companies on a page failure and retries that same page", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({ items: [initialCompany], page: 1, limit: 20, total: 21 })
    )
    .mockRejectedValueOnce(new Error("Falha temporária"))
    .mockResolvedValueOnce(
      response({ items: [], page: 2, limit: 20, total: 1 })
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<CompaniesView accessToken="reader-token" />);
  await screen.findByText(initialCompany.legalName);
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais empresas" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha temporária"
  );
  expect(screen.getByText(initialCompany.legalName)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais empresas" })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Carregar mais empresas" })
    ).not.toBeInTheDocument()
  );
  expect(
    fetchMock.mock.calls
      .slice(1)
      .every(([url]) => String(url).includes("page=2&limit=20"))
  ).toBe(true);
});

it("ignores a late extra page after the authenticated session changes", async () => {
  let resolveOld!: (value: Response) => void;
  const oldPage = new Promise<Response>(resolve => {
    resolveOld = resolve;
  });
  const other = {
    ...initialCompany,
    id: "other-company",
    legalName: "Empresa da outra sessão",
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({ items: [initialCompany], page: 1, limit: 20, total: 21 })
    )
    .mockImplementationOnce(() => oldPage)
    .mockResolvedValueOnce(
      response({ items: [other], page: 1, limit: 20, total: 1 })
    );
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<CompaniesView accessToken="old-session" />);
  await screen.findByText(initialCompany.legalName);
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais empresas" })
  );
  expect(
    screen.getByRole("button", { name: "Carregando mais empresas..." })
  ).toBeDisabled();
  rerender(<CompaniesView accessToken="new-session" />);
  await screen.findByText(other.legalName);
  await act(async () => {
    resolveOld(
      response({
        items: [
          { ...initialCompany, id: "late", legalName: "Empresa atrasada" },
        ],
        page: 2,
        limit: 20,
        total: 21,
      })
    );
    await oldPage;
  });
  await waitFor(() =>
    expect(screen.queryByText("Empresa atrasada")).not.toBeInTheDocument()
  );
  expect(screen.queryByText(initialCompany.legalName)).not.toBeInTheDocument();
});

it("does not let an old import confirmation invalidate the new session load", async () => {
  let finishImport!: (value: Response) => void;
  let finishNewLoad!: (value: Response) => void;
  const pendingImport = new Promise<Response>(resolve => {
    finishImport = resolve;
  });
  const pendingNewLoad = new Promise<Response>(resolve => {
    finishNewLoad = resolve;
  });
  const other = {
    ...initialCompany,
    id: "new-tenant",
    legalName: "Empresa da sessão nova",
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      response({ items: [], page: 1, limit: 20, total: 0 })
    )
    .mockResolvedValueOnce(
      response({
        fingerprint: "a".repeat(64),
        processed: 1,
        valid: 1,
        invalid: 0,
        rows: [],
      })
    )
    .mockImplementationOnce(() => pendingImport)
    .mockImplementationOnce(() => pendingNewLoad)
    .mockResolvedValue(
      response({ items: [initialCompany], page: 1, limit: 20, total: 1 })
    );
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<CompaniesView accessToken="old-session" />);
  await screen.findByText("Nenhuma empresa encontrada.");
  fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
    target: {
      files: [
        new File(["legalName\nTeste"], "teste.csv", { type: "text/csv" }),
      ],
    },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirmar importação" })
  );
  rerender(<CompaniesView accessToken="new-session" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  await act(async () => {
    finishImport(
      response({ processed: 1, imported: 1, rejected: 0, rows: [] })
    );
    await pendingImport;
  });
  await act(async () => {
    finishNewLoad(response({ items: [other], page: 1, limit: 20, total: 1 }));
    await pendingNewLoad;
  });
  expect(await screen.findByText(other.legalName)).toBeInTheDocument();
  expect(screen.queryByText("Carregando empresas...")).not.toBeInTheDocument();
  expect(screen.queryByText(initialCompany.legalName)).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
