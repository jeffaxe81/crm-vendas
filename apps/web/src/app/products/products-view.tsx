"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { formatMoney } from "../opportunities/opportunity-items-panel";

type ProductRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  isActive: boolean;
  version: number;
};

type ProductsViewProps = {
  accessToken: string;
  canWrite: boolean;
};

type ProductForm = {
  code: string;
  name: string;
  unitPrice: string;
  description: string;
  isActive: boolean;
};

const emptyForm: ProductForm = {
  code: "",
  name: "",
  unitPrice: "",
  description: "",
  isActive: true,
};

/** C4.3 — catálogo de produtos. */
export function ProductsView({ accessToken, canWrite }: ProductsViewProps) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (query) params.set("q", query);
      try {
        const result = await apiRequest<{ items: ProductRecord[] }>(
          `/products?${params.toString()}`,
          { accessToken }
        );
        if (active) setProducts(result.items);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os produtos."
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
  }, [accessToken, query, refresh]);

  function openCreate() {
    setError("");
    setEditing(null);
    setForm(emptyForm);
    setFormMode("create");
  }

  function openEdit(product: ProductRecord) {
    setError("");
    setEditing(product);
    setForm({
      code: product.code,
      name: product.name,
      unitPrice: product.unitPrice,
      description: product.description ?? "",
      isActive: product.isActive,
    });
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditing(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = form.code.trim();
    const name = form.name.trim();
    const unitPrice = form.unitPrice.trim().replace(",", ".");
    if (!code || !name || !unitPrice) {
      setError("Informe código, nome e preço.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const description = form.description.trim();
      if (formMode === "edit" && editing) {
        await apiRequest<ProductRecord>(`/products/${editing.id}`, {
          accessToken,
          method: "PATCH",
          body: {
            code,
            name,
            unitPrice,
            description: description || null,
            isActive: form.isActive,
            version: editing.version,
          },
        });
      } else {
        await apiRequest<ProductRecord>("/products", {
          accessToken,
          method: "POST",
          body: {
            code,
            name,
            unitPrice,
            ...(description ? { description } : {}),
            isActive: form.isActive,
          },
        });
      }
      closeForm();
      setRefresh(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o produto."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(product: ProductRecord) {
    setError("");
    try {
      await apiRequest<void>(`/products/${product.id}`, {
        accessToken,
        method: "DELETE",
      });
      setProducts(current => current.filter(item => item.id !== product.id));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o produto."
      );
    }
  }

  return (
    <section className="companies-view" aria-labelledby="products-title">
      <header className="companies-view__header">
        <div>
          <p className="companies-view__eyebrow">Catálogo</p>
          <h1 id="products-title">Produtos</h1>
          <p>Produtos e serviços usados para compor oportunidades.</p>
        </div>
        {canWrite ? (
          <div className="companies-view__header-actions">
            <button
              type="button"
              className="button companies-view__primary"
              onClick={openCreate}
            >
              Novo produto
            </button>
          </div>
        ) : null}
      </header>

      <form
        className="companies-view__toolbar"
        role="search"
        onSubmit={event => {
          event.preventDefault();
          setQuery(queryInput.trim());
        }}
      >
        <label>
          <span>Buscar produtos</span>
          <input
            type="search"
            aria-label="Buscar produtos"
            placeholder="Código ou nome"
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {formMode ? (
        <form
          className="company-form"
          aria-label={formMode === "create" ? "Novo produto" : "Editar produto"}
          onSubmit={submit}
        >
          <div className="company-form__heading">
            <div>
              <p>{formMode === "create" ? "Novo cadastro" : "Edição"}</p>
              <h2>
                {formMode === "create" ? "Novo produto" : "Editar produto"}
              </h2>
            </div>
            <button type="button" onClick={closeForm}>
              Cancelar
            </button>
          </div>
          <div className="company-form__fields">
            <label>
              <span>Código</span>
              <input
                value={form.code}
                onChange={event =>
                  setForm(current => ({ ...current, code: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Nome</span>
              <input
                value={form.name}
                onChange={event =>
                  setForm(current => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Preço unitário</span>
              <input
                inputMode="decimal"
                value={form.unitPrice}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    unitPrice: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Descrição</span>
              <input
                value={form.description}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Ativo</span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
            </label>
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar produto"}
          </button>
        </form>
      ) : null}

      {loading ? <p>Carregando produtos...</p> : null}

      {!loading && products.length === 0 ? (
        <p>Nenhum produto encontrado.</p>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="company-import__table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Preço</th>
                <th>Situação</th>
                {canWrite ? <th aria-label="Ações" /> : null}
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id}>
                  <td>{product.code}</td>
                  <td>{product.name}</td>
                  <td>{formatMoney(product.unitPrice)}</td>
                  <td>{product.isActive ? "Ativo" : "Inativo"}</td>
                  {canWrite ? (
                    <td>
                      <button
                        type="button"
                        onClick={() => openEdit(product)}
                        aria-label={`Editar ${product.name}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(product)}
                        aria-label={`Excluir ${product.name}`}
                      >
                        Excluir
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
