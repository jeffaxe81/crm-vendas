import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

const product = {
  id: "p-1",
  code: "LIC",
  name: "Licença PABX",
  description: null,
  unitPrice: "1200.50",
  isActive: true,
  version: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("C4.3 products view", () => {
  it("returns to the previous page after deleting its final record", async () => {
    let deleted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          deleted = true;
          return response(null, 204);
        }
        const page = new URL(String(input)).searchParams.get("page");
        return response({
          items:
            page === "2"
              ? deleted
                ? []
                : [product]
              : [{ ...product, id: "remaining", name: "Registro restante" }],
          total: deleted ? 50 : 51,
        });
      })
    );
    render(<ProductsView accessToken="token" canWrite />);
    await screen.findByText("Registro restante");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir Licença PABX" })
    );
    expect(await screen.findByText("Registro restante")).toBeVisible();
    expect(screen.queryByText("Licença PABX")).not.toBeInTheDocument();
  });

  it("lists products and creates a new one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [product], total: 1 }))
      .mockResolvedValueOnce(response({ ...product, id: "p-2" }, 201))
      .mockResolvedValueOnce(
        response({
          items: [
            product,
            { ...product, id: "p-2", code: "IMPL", name: "Implantação" },
          ],
          total: 2,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductsView accessToken="token" canWrite />);

    expect(await screen.findByText("Licença PABX")).toBeInTheDocument();
    expect(screen.getByText(/1\.200,50/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
    const form = screen.getByRole("form", { name: "Novo produto" });
    fireEvent.change(within(form).getByLabelText("Código"), {
      target: { value: "IMPL" },
    });
    fireEvent.change(within(form).getByLabelText("Nome"), {
      target: { value: "Implantação" },
    });
    fireEvent.change(within(form).getByLabelText("Preço unitário"), {
      target: { value: "2.500,00" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar produto" })
    );

    expect(await screen.findByText("Implantação")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/products");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      code: "IMPL",
      name: "Implantação",
      unitPrice: "2500.00",
      isActive: true,
    });
  });

  it("navigates through server-side product pages", async () => {
    const secondPageProduct = {
      ...product,
      id: "p-51",
      code: "P051",
      name: "Produto 51",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          items: [product],
          page: 1,
          limit: 50,
          total: 51,
        })
      )
      .mockResolvedValueOnce(
        response({
          items: [secondPageProduct],
          page: 2,
          limit: 50,
          total: 51,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductsView accessToken="token" canWrite />);

    await screen.findByText("Licença PABX");
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    expect(await screen.findByText("Produto 51")).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/products?page=1&limit=50"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/products?page=2&limit=50"
    );
  });

  it("hides write actions without product.write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response({ items: [product], total: 1 }))
    );

    render(<ProductsView accessToken="token" canWrite={false} />);

    expect(await screen.findByText("Licença PABX")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Novo produto" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Excluir Licença PABX" })
    ).not.toBeInTheDocument();
  });

  it("sends version when editing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [product], total: 1 }))
      .mockResolvedValueOnce(response({ ...product, name: "Nova", version: 2 }))
      .mockResolvedValueOnce(
        response({
          items: [{ ...product, name: "Nova", version: 2 }],
          total: 1,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductsView accessToken="token" canWrite />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Licença PABX" })
    );
    const form = screen.getByRole("form", { name: "Editar produto" });
    fireEvent.change(within(form).getByLabelText("Nome"), {
      target: { value: "Nova" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Salvar produto" })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/products/p-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Nova",
      version: 1,
    });
  });
});

describe("products visible-page CSV export", () => {
  it("exports only the current server page for read-only users with safe CSV values", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [product], total: 51 }))
      .mockResolvedValueOnce(
        response({
          items: [
            {
              ...product,
              id: "p-51",
              code: "=SUM(1)",
              name: "Produto 51",
              description: 'Texto, "especial"',
              isActive: false,
            },
          ],
          total: 51,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    let downloaded: Blob | undefined;
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL(blob: Blob) {
          downloaded = blob;
          return "blob:products";
        }
        static revokeObjectURL() {}
      }
    );
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });
    render(<ProductsView accessToken="token" canWrite={false} />);
    await screen.findByText("Licença PABX");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Produto 51");
    const button = screen.getByRole("button", {
      name: "Exportar produtos CSV",
    });
    expect(button).toHaveAttribute(
      "title",
      "Exporta somente os produtos da página atual."
    );
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(filename).toBe("produtos-pagina-2.csv");
    expect(downloaded?.type).toBe("text/csv;charset=utf-8");
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(downloaded!);
    });
    expect(csv).toContain(
      '"Código","Nome","Descrição","Preço unitário","Situação"'
    );
    expect(csv).toContain(
      `"'=SUM(1)","Produto 51","Texto, ""especial""","1200.50","Inativo"`
    );
    expect(csv).not.toContain("Licença PABX");
    expect(
      screen.queryByRole("button", { name: "Novo produto" })
    ).not.toBeInTheDocument();
  });

  it("disables export while loading and when the page is empty", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(done => {
            resolve = done;
          })
      )
    );
    render(<ProductsView accessToken="token" canWrite />);
    expect(
      screen.getByRole("button", { name: "Exportar produtos CSV" })
    ).toBeDisabled();
    resolve(response({ items: [], total: 0 }));
    await screen.findByText("Nenhum produto encontrado.");
    expect(
      screen.getByRole("button", { name: "Exportar produtos CSV" })
    ).toBeDisabled();
  });

  it("disables export of stale products after a page request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ items: [product], total: 51 }))
        .mockResolvedValueOnce(response({ message: "Falha" }, 500))
    );
    render(<ProductsView accessToken="token" canWrite={false} />);
    await screen.findByText("Licença PABX");
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Exportar produtos CSV" })
    ).toBeDisabled();
  });
});
