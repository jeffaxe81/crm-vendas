import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductsView } from "./products-view";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyProducts = { items: [], page: 1, limit: 100, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.3.2 product CSV import view", () => {
  it("previews and confirms the CSV, then refreshes products", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyProducts))
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
              data: { code: "LIC", name: "Licença PABX", unitPrice: "1200,50" },
              product: {
                code: "LIC",
                name: "Licença PABX",
                unitPrice: "1200.50",
                isActive: true,
              },
              errors: [],
            },
            {
              rowNumber: 3,
              status: "INVALID",
              data: { code: "OLD", name: "Antigo", unitPrice: "1" },
              errors: ["Código já cadastrado para outro produto."],
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
              productId: "p-1",
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
              id: "p-1",
              code: "LIC",
              name: "Licença PABX",
              description: null,
              unitPrice: "1200.50",
              isActive: true,
              version: 1,
            },
          ],
          total: 1,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductsView accessToken="access-token" canWrite />);

    expect(await screen.findByText("Nenhum produto encontrado.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Importar CSV" }));
    const file = new File(
      ['code,name,unitPrice\nLIC,Licença PABX,"1200,50"\nOLD,Antigo,1'],
      "produtos.csv",
      { type: "text/csv" }
    );
    fireEvent.change(screen.getByLabelText("Arquivo CSV de produtos"), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText("1 válida(s) · 1 inválida(s)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Código já cadastrado para outro produto.")
    ).toBeInTheDocument();
    expect(screen.getByText(/1\.200,50/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar importação" })
    );

    expect(
      await screen.findByText("1 importado(s) · 1 rejeitado(s)")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(await screen.findByText("Licença PABX")).toBeInTheDocument();

    const [previewUrl, previewInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    const [confirmUrl, confirmInit] = fetchMock.mock.calls[2] as [
      string,
      RequestInit,
    ];
    expect(previewUrl).toContain("/product-imports/preview");
    expect(confirmUrl).toContain("/product-imports/confirm");
    expect(previewInit.body).toBeInstanceOf(FormData);
    expect((confirmInit.body as FormData).get("fingerprint")).toBe(
      "b".repeat(64)
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("/products?");
  });

  it("shows API validation errors and disables confirmation without valid rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(emptyProducts))
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
              data: { code: "A" },
              errors: ["name: obrigatório"],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Coluna obrigatória ausente: unitPrice",
            },
          },
          400
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductsView accessToken="access-token" canWrite />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Importar CSV" })
    );
    const input = screen.getByLabelText("Arquivo CSV de produtos");
    fireEvent.change(input, {
      target: {
        files: [new File(["code,name,unitPrice\nA,,"], "p.csv")],
      },
    });

    expect(
      await screen.findByRole("button", { name: "Confirmar importação" })
    ).toBeDisabled();

    fireEvent.change(input, {
      target: { files: [new File(["code,name\nA,B"], "p.csv")] },
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("hides the import action without product.write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(emptyProducts))
    );

    render(<ProductsView accessToken="access-token" canWrite={false} />);

    expect(await screen.findByText("Nenhum produto encontrado.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Importar CSV" })
    ).not.toBeInTheDocument();
  });
});
