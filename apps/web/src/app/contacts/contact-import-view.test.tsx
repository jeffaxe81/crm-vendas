import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactsView } from "./contacts-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyContacts = { items: [], page: 1, limit: 20, total: 0 };
const emptyCompanies = { items: [], page: 1, limit: 100, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.2.2 contact CSV import view", () => {
  it("previews and confirms the CSV, then refreshes contacts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyContacts))
      .mockResolvedValueOnce(response(emptyCompanies))
      .mockResolvedValueOnce(
        response({
          fingerprint: "b".repeat(64),
          processed: 2,
          valid: 1,
          invalid: 1,
          rows: [
            {
              rowNumber: 2,
              status: "VALID",
              data: { fullName: "Ana Souza", email: "ana@example.test" },
              errors: [],
            },
            {
              rowNumber: 3,
              status: "INVALID",
              data: { fullName: "Bia", email: "nao-e-email" },
              errors: ["email: formato de e-mail inválido."],
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
              contactId: "c-1",
              errors: [],
            },
            { rowNumber: 3, status: "REJECTED", errors: ["x"] },
          ],
        })
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: "c-1",
              organizationId: "tenant-a",
              fullName: "Ana Souza",
              jobTitle: null,
              notes: null,
              version: 1,
              createdBy: "user-a",
              updatedBy: "user-a",
              deletedAt: null,
              deletedBy: null,
              createdAt: "2026-09-23T03:00:00.000Z",
              updatedAt: "2026-09-23T03:00:00.000Z",
              channels: [],
              relationshipEntries: [],
            },
          ],
          page: 1,
          limit: 20,
          total: 1,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken="access-token" canWrite />);

    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));
    const file = new File(
      ["fullName,email\nAna Souza,ana@example.test\nBia,nao-e-email"],
      "contatos.csv",
      { type: "text/csv" }
    );
    fireEvent.change(screen.getByLabelText("Arquivo CSV de contatos"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("1 válida(s) · 1 inválida(s)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("email: formato de e-mail inválido.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar importação" })
    );

    expect(
      await screen.findByText("1 importado(s) · 1 rejeitado(s)")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    const [previewUrl, previewInit] = fetchMock.mock.calls[2] as [
      string,
      RequestInit,
    ];
    const [confirmUrl, confirmInit] = fetchMock.mock.calls[3] as [
      string,
      RequestInit,
    ];
    expect(previewUrl).toContain("/contact-imports/preview");
    expect(confirmUrl).toContain("/contact-imports/confirm");
    expect(previewInit.body).toBeInstanceOf(FormData);
    expect((confirmInit.body as FormData).get("fingerprint")).toBe(
      "b".repeat(64)
    );
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain("/contacts?");
  });

  it("disables confirmation when no row is valid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyContacts))
      .mockResolvedValueOnce(response(emptyCompanies))
      .mockResolvedValueOnce(
        response({
          fingerprint: "c".repeat(64),
          processed: 1,
          valid: 0,
          invalid: 1,
          rows: [
            {
              rowNumber: 2,
              status: "INVALID",
              data: {},
              errors: ["fullName: obrigatório"],
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactsView accessToken="access-token" canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));
    fireEvent.change(screen.getByLabelText("Arquivo CSV de contatos"), {
      target: {
        files: [new File(["fullName\n"], "c.csv", { type: "text/csv" })],
      },
    });

    expect(
      await screen.findByRole("button", { name: "Confirmar importação" })
    ).toBeDisabled();
  });

  it("hides the import action without contact.write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(emptyContacts))
        .mockResolvedValueOnce(response(emptyCompanies))
    );

    render(<ContactsView accessToken="access-token" canWrite={false} />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Importar CSV" })
      ).not.toBeInTheDocument();
    });
  });
});
