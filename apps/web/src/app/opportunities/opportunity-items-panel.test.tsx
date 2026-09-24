import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpportunityItemsPanel } from "./opportunity-items-panel";

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
