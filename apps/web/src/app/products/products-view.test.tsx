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
});

describe("C4.3 products view", () => {
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
