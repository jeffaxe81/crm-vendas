import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompaniesView } from "./companies-view";

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

describe("C4.2.1 company CSV import view", () => {
  it("previews and confirms the selected CSV before refreshing companies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 20, total: 0 })
      )
      .mockResolvedValueOnce(
        response({
          fingerprint: "a".repeat(64),
          processed: 2,
          valid: 1,
          invalid: 1,
          rows: [
            {
              rowNumber: 2,
              status: "VALID",
              data: { legalName: "Empresa Alpha", document: "DOC-A" },
              errors: [],
            },
            {
              rowNumber: 3,
              status: "INVALID",
              data: { legalName: "Empresa Beta", website: "nao-e-url" },
              errors: ["Invalid URL"],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        response({
          processed: 2,
          imported: 1,
          rejected: 1,
          rows: [
            {
              rowNumber: 2,
              status: "IMPORTED",
              companyId: "company-alpha",
              errors: [],
            },
            {
              rowNumber: 3,
              status: "REJECTED",
              errors: ["Invalid URL"],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: "company-alpha",
              organizationId: "tenant-a",
              legalName: "Empresa Alpha",
              tradeName: null,
              document: "DOC-A",
              website: null,
              notes: null,
              version: 1,
              createdBy: "user-a",
              updatedBy: "user-a",
              deletedAt: null,
              deletedBy: null,
              createdAt: "2026-09-13T03:00:00.000Z",
              updatedAt: "2026-09-13T03:00:00.000Z",
            },
          ],
          page: 1,
          limit: 20,
          total: 1,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CompaniesView accessToken="access-token" canWrite />
    );

    await screen.findByText("Nenhuma empresa encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));

    const file = new File(
      ["legalName,document\nEmpresa Alpha,DOC-A"],
      "empresas.csv",
      { type: "text/csv" }
    );
    fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("1 válida(s) · 1 inválida(s)")).toBeInTheDocument();
    expect(screen.getByText("Empresa Alpha")).toBeInTheDocument();
    expect(screen.getByText("Empresa Beta")).toBeInTheDocument();
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Confirmar importação" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(
      await screen.findByText("1 importada(s) · 1 rejeitada(s)")
    ).toBeInTheDocument();
    expect(await screen.findByText("Empresa Alpha")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const previewRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const confirmRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(previewRequest.body).toBeInstanceOf(FormData);
    expect(confirmRequest.body).toBeInstanceOf(FormData);
    expect((previewRequest.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect((confirmRequest.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect((confirmRequest.body as FormData).get("fingerprint")).toBe(
      "a".repeat(64)
    );
    expect((confirmRequest.body as FormData).get("file")).toBe(file);
  });

  it("keeps confirmation disabled when preview has no valid rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [], page: 1, limit: 20, total: 0 })
      )
      .mockResolvedValueOnce(
        response({
          fingerprint: "b".repeat(64),
          processed: 1,
          valid: 0,
          invalid: 1,
          rows: [
            {
              rowNumber: 2,
              status: "INVALID",
              data: { legalName: "Empresa Inválida" },
              errors: ["Documento inválido"],
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<CompaniesView accessToken="access-token" canWrite />);
    await screen.findByText("Nenhuma empresa encontrada.");
    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));
    fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
      target: {
        files: [new File(["legalName\nEmpresa Inválida"], "invalidas.csv")],
      },
    });

    expect(await screen.findByText("0 válida(s) · 1 inválida(s)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar importação" })
    ).toBeDisabled();
  });

  it("does not expose import action without company.write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({ items: [], page: 1, limit: 20, total: 0 })
      )
    );

    render(<CompaniesView accessToken="access-token" canWrite={false} />);
    await screen.findByText("Nenhuma empresa encontrada.");

    expect(
      screen.queryByRole("button", { name: "Importar CSV" })
    ).not.toBeInTheDocument();
  });
});
