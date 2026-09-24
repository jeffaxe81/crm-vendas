"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

export type OpportunityItemRecord = {
  id: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
};

type ProductOption = {
  id: string;
  code: string;
  name: string;
  unitPrice: string;
};

type OpportunitySnapshot = {
  id: string;
  title: string;
  estimatedValue: string;
  version: number;
};

type OpportunityItemsPanelProps<T extends OpportunitySnapshot> = {
  accessToken: string;
  opportunity: T;
  canWrite: boolean;
  onOpportunityChange: (opportunity: T) => void;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const formatMoney = (value: string) => money.format(Number(value));

/** C4.3.1 — itens da oportunidade; o valor é recalculado pela API. */
export function OpportunityItemsPanel<T extends OpportunitySnapshot>({
  accessToken,
  opportunity,
  canWrite,
  onOpportunityChange,
}: OpportunityItemsPanelProps<T>) {
  const [items, setItems] = useState<OpportunityItemRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discountPercent, setDiscountPercent] = useState("0");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [itemResult, productResult] = await Promise.all([
          apiRequest<{ items: OpportunityItemRecord[] }>(
            `/opportunities/${opportunity.id}/items`,
            { accessToken }
          ),
          canWrite
            ? apiRequest<{ items: ProductOption[] }>(
                "/products?active=true&limit=100&sortBy=name",
                { accessToken }
              )
            : Promise.resolve({ items: [] as ProductOption[] }),
        ]);
        if (active) {
          setItems(itemResult.items);
          setProducts(productResult.items);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os itens."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [accessToken, opportunity.id, canWrite]);

  function applyOpportunity(updated: Pick<T, "estimatedValue" | "version">) {
    onOpportunityChange({
      ...opportunity,
      estimatedValue: updated.estimatedValue,
      version: updated.version,
    });
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId) {
      setError("Selecione um produto.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        item: OpportunityItemRecord;
        opportunity: T;
      }>(`/opportunities/${opportunity.id}/items`, {
        accessToken,
        method: "POST",
        body: {
          productId,
          quantity: quantity.trim().replace(",", "."),
          discountPercent: discountPercent.trim().replace(",", ".") || "0",
          version: opportunity.version,
        },
      });
      setItems(current => [...current, result.item]);
      applyOpportunity(result.opportunity);
      setProductId("");
      setQuantity("1");
      setDiscountPercent("0");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível adicionar o item."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: OpportunityItemRecord) {
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ opportunity: T }>(
        `/opportunities/${opportunity.id}/items/${item.id}?version=${opportunity.version}`,
        { accessToken, method: "DELETE" }
      );
      setItems(current => current.filter(entry => entry.id !== item.id));
      applyOpportunity(result.opportunity);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover o item."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="opportunity-items"
      aria-label={`Itens de ${opportunity.title}`}
    >
      {loading ? <p>Carregando itens...</p> : null}
      {error ? (
        <p className="opportunities-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p>Nenhum item. O valor estimado é informado manualmente.</p>
      ) : null}

      {items.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Preço unit.</th>
              <th>Desc. %</th>
              <th>Total</th>
              {canWrite ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>{Number(item.discountPercent).toLocaleString("pt-BR")}</td>
                <td>{formatMoney(item.lineTotal)}</td>
                {canWrite ? (
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeItem(item)}
                      aria-label={`Remover ${item.description}`}
                    >
                      Remover
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Total da oportunidade</th>
              <td>{formatMoney(opportunity.estimatedValue)}</td>
              {canWrite ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      ) : null}

      {canWrite ? (
        <form
          className="opportunity-items__form"
          aria-label={`Adicionar item em ${opportunity.title}`}
          onSubmit={addItem}
        >
          <label>
            <span>Produto</span>
            <select
              value={productId}
              disabled={busy}
              onChange={event => setProductId(event.target.value)}
            >
              <option value="">Selecione</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.code} — {product.name} (
                  {formatMoney(product.unitPrice)})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Quantidade</span>
            <input
              inputMode="decimal"
              value={quantity}
              disabled={busy}
              onChange={event => setQuantity(event.target.value)}
            />
          </label>
          <label>
            <span>Desconto (%)</span>
            <input
              inputMode="decimal"
              value={discountPercent}
              disabled={busy}
              onChange={event => setDiscountPercent(event.target.value)}
            />
          </label>
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Salvando..." : "Adicionar item"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
