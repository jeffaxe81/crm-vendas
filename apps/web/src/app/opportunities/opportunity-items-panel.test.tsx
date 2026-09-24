import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpportunityItemsPanel,
  VERSION_CONFLICT_MESSAGE,
  normalizeDecimal,
} from "./opportunity-items-panel";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const opportunity = {
  id: "o-1",
  title: "Contrato PABX",
  estimatedValue: "0.00",
  version: 3,
};

const item = {
  id: "i-1",
  productId: "p-1",
  description: "Licença",
  quantity: "10.000",
  unitPrice: "100.00",
  discountPercent: "12.50",
  lineTotal: "875.00",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("C4.3.1 opportunity items panel", () => {
  it("adds an item and propagates the recalculated value and version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response({
          items: [
            { id: "p-1", code: "LIC", name: "Licença", unitPrice: "100.00" },
          ],
        })
      )
      .mockResolvedValueOnce(
        response(
          {
            item,
            opportunity: {
              ...opportunity,
              estimatedValue: "875.00",
              version: 4,
            },
          },
          201
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();

    render(
      <OpportunityItemsPanel
        accessToken="token"
        opportunity={opportunity}
        canWrite
        onOpportunityChange={onChange}
      />
    );

    const form = await screen.findByRole("form", {
      name: "Adicionar item em Contrato PABX",
    });
    await waitFor(() =>
      expect(
        within(form).getByRole("option", { name: /LIC/ })
      ).toBeInTheDocument()
    );
    fireEvent.change(within(form).getByLabelText("Produto"), {
      target: { value: "p-1" },
    });
    fireEvent.change(within(form).getByLabelText("Quantidade"), {
      target: { value: "10" },
    });
    fireEvent.change(within(form).getByLabelText("Desconto (%)"), {
      target: { value: "12,5" },
    });
    fireEvent.click(
      within(form).getByRole("button", { name: "Adicionar item" })
    );

    expect(await screen.findByText("Licença")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({
      ...opportunity,
      estimatedValue: "875.00",
      version: 4,
    });

    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/opportunities/o-1/items");
    expect(JSON.parse(String(init.body))).toEqual({
      productId: "p-1",
      quantity: "10",
      discountPercent: "12.5",
      version: 3,
    });
  });

  it("removes an item using the opportunity version", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response({
          opportunity: { ...opportunity, estimatedValue: "0.00", version: 4 },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();

    render(
      <OpportunityItemsPanel
        accessToken="token"
        opportunity={{ ...opportunity, estimatedValue: "875.00" }}
        canWrite
        onOpportunityChange={onChange}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Remover Licença" })
    );

    await waitFor(() =>
      expect(screen.queryByText("Licença")).not.toBeInTheDocument()
    );
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/opportunities/o-1/items/i-1?version=3");
    expect(init.method).toBe("DELETE");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedValue: "0.00", version: 4 })
    );
  });

  it("is read-only without opportunity.write", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OpportunityItemsPanel
        accessToken="token"
        opportunity={opportunity}
        canWrite={false}
        onOpportunityChange={vi.fn()}
      />
    );

    expect(await screen.findByText("Licença")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("C4.3.3 opportunity item editing", () => {
  const withItem = { ...opportunity, estimatedValue: "875.00" };

  function renderEditable(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(
      <OpportunityItemsPanel
        accessToken="token"
        opportunity={withItem}
        canWrite
        onOpportunityChange={onChange}
      />
    );
    return onChange;
  }

  it("edits quantity, price and discount with decimal comma and propagates the new version", async () => {
    const updatedItem = {
      ...item,
      quantity: "12.500",
      unitPrice: "1234.50",
      discountPercent: "10.00",
      lineTotal: "13888.13",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response({
          item: updatedItem,
          opportunity: {
            ...withItem,
            estimatedValue: "13888.13",
            version: 4,
          },
        })
      );
    const onChange = renderEditable(fetchMock);

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Licença" })
    );
    const quantityInput = screen.getByLabelText("Quantidade de Licença");
    expect(quantityInput).toHaveValue("10");
    expect(screen.getByLabelText("Preço unitário de Licença")).toHaveValue(
      "100"
    );
    expect(screen.getByLabelText("Desconto (%) de Licença")).toHaveValue(
      "12,5"
    );
    expect(
      screen.queryByRole("button", { name: "Remover Licença" })
    ).not.toBeInTheDocument();

    fireEvent.change(quantityInput, { target: { value: "12,5" } });
    fireEvent.change(screen.getByLabelText("Preço unitário de Licença"), {
      target: { value: "1.234,50" },
    });
    fireEvent.change(screen.getByLabelText("Desconto (%) de Licença"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Licença" }));

    await waitFor(() =>
      expect(
        screen.queryByLabelText("Quantidade de Licença")
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText("12,5")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({
      ...withItem,
      estimatedValue: "13888.13",
      version: 4,
    });

    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toMatch(/\/opportunities\/o-1\/items\/i-1$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      quantity: "12.5",
      unitPrice: "1234.50",
      discountPercent: "10",
      version: 3,
    });
  });

  it("asks to reload when the opportunity version is stale (409)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response(
          {
            code: "OPPORTUNITY_VERSION_CONFLICT",
            message: "A oportunidade foi alterada por outra operação.",
          },
          409
        )
      );
    const onChange = renderEditable(fetchMock);

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Licença" })
    );
    fireEvent.change(screen.getByLabelText("Quantidade de Licença"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Licença" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      VERSION_CONFLICT_MESSAGE
    );
    expect(VERSION_CONFLICT_MESSAGE).toMatch(/Recarregue a página/);
    expect(screen.getByLabelText("Quantidade de Licença")).toHaveValue("20");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels the edit without calling the API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }))
      .mockResolvedValueOnce(response({ items: [] }));
    renderEditable(fetchMock);

    fireEvent.click(
      await screen.findByRole("button", { name: "Editar Licença" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar edição de Licença" })
    );

    expect(
      screen.queryByLabelText("Quantidade de Licença")
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not offer editing without opportunity.write", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <OpportunityItemsPanel
        accessToken="token"
        opportunity={withItem}
        canWrite={false}
        onOpportunityChange={vi.fn()}
      />
    );

    expect(await screen.findByText("Licença")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar Licença" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("normalizes decimal comma input", () => {
    expect(normalizeDecimal(" 12,5 ")).toBe("12.5");
    expect(normalizeDecimal("1.234,56")).toBe("1234.56");
    expect(normalizeDecimal("12.5")).toBe("12.5");
    expect(normalizeDecimal("")).toBe("");
  });
});
