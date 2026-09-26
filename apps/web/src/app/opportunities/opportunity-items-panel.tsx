"use client";

import { FormEvent, useEffect, useState } from "react";

import { ApiError, apiRequest } from "../../lib/api-client";

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

export const VERSION_CONFLICT_MESSAGE =
  "Esta oportunidade foi alterada em outra operação. Recarregue a página para ver os dados atuais antes de tentar novamente.";

/**
 * Aceita vírgula decimal ("1.234,5" → "1234.5"). Sem vírgula, o ponto é o
 * separador decimal ("12.5" → "12.5").
 */
export function normalizeDecimal(value: string): string {
  const trimmed = value.trim().replace(/\s/g, "");
  return trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
}

/** Valor da API ("12.50") para edição com vírgula ("12,5"). */
function toInputValue(value: string): string {
  return String(Number(value)).replace(".", ",");
}

function describeError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError && cause.status === 409) {
    return VERSION_CONFLICT_MESSAGE;
  }
  return cause instanceof Error ? cause.message : fallback;
}

type ItemDraft = {
  quantity: string;
  unitPrice: string;
  discountPercent: string;
};

/**
 * C4.3.1/C4.3.3 — itens da oportunidade (incluir, editar e remover); o valor
 * é recalculado pela API.
 */
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft>({
    quantity: "",
    unitPrice: "",
    discountPercent: "",
  });

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
          setError(describeError(cause, "Não foi possível carregar os itens."));
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
          quantity: normalizeDecimal(quantity),
          discountPercent: normalizeDecimal(discountPercent) || "0",
          version: opportunity.version,
        },
      });
      setItems(current => [...current, result.item]);
      applyOpportunity(result.opportunity);
      setProductId("");
      setQuantity("1");
      setDiscountPercent("0");
    } catch (cause) {
      setError(describeError(cause, "Não foi possível adicionar o item."));
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
      setError(describeError(cause, "Não foi possível remover o item."));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: OpportunityItemRecord) {
    setError("");
    setEditingItemId(item.id);
    setDraft({
      quantity: toInputValue(item.quantity),
      unitPrice: toInputValue(item.unitPrice),
      discountPercent: toInputValue(item.discountPercent),
    });
  }

  function cancelEdit() {
    setEditingItemId(null);
    setError("");
  }

  async function saveItem(item: OpportunityItemRecord) {
    const nextQuantity = normalizeDecimal(draft.quantity);
    const nextUnitPrice = normalizeDecimal(draft.unitPrice);
    const nextDiscount = normalizeDecimal(draft.discountPercent);
    if (!nextQuantity || !nextUnitPrice || !nextDiscount) {
      setError("Informe quantidade, preço unitário e desconto.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        item: OpportunityItemRecord;
        opportunity: T;
      }>(`/opportunities/${opportunity.id}/items/${item.id}`, {
        accessToken,
        method: "PATCH",
        body: {
          quantity: nextQuantity,
          unitPrice: nextUnitPrice,
          discountPercent: nextDiscount,
          version: opportunity.version,
        },
      });
      setItems(current =>
        current.map(entry => (entry.id === item.id ? result.item : entry))
      );
      applyOpportunity(result.opportunity);
      setEditingItemId(null);
    } catch (cause) {
      setError(describeError(cause, "Não foi possível alterar o item."));
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
            {items.map(item =>
              canWrite && editingItemId === item.id ? (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`Quantidade de ${item.description}`}
                      value={draft.quantity}
                      disabled={busy}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          quantity: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`Preço unitário de ${item.description}`}
                      value={draft.unitPrice}
                      disabled={busy}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          unitPrice: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`Desconto (%) de ${item.description}`}
                      value={draft.discountPercent}
                      disabled={busy}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          discountPercent: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>{formatMoney(item.lineTotal)}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveItem(item)}
                      aria-label={`Salvar ${item.description}`}
                    >
                      {busy ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={cancelEdit}
                      aria-label={`Cancelar edição de ${item.description}`}
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                  <td>{formatMoney(item.unitPrice)}</td>
                  <td>
                    {Number(item.discountPercent).toLocaleString("pt-BR")}
                  </td>
                  <td>{formatMoney(item.lineTotal)}</td>
                  {canWrite ? (
                    <td>
                      <button
                        type="button"
                        disabled={busy || editingItemId !== null}
                        onClick={() => startEdit(item)}
                        aria-label={`Editar ${item.description}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busy || editingItemId !== null}
                        onClick={() => void removeItem(item)}
                        aria-label={`Remover ${item.description}`}
                      >
                        Remover
                      </button>
                    </td>
                  ) : null}
                </tr>
              )
            )}
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
