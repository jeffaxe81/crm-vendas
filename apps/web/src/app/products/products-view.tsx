"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import {
  formatMoney,
  normalizeDecimal,
} from "../opportunities/opportunity-items-panel";
import { ProductImportPanel } from "./product-import-panel";
import { useTranslation } from "../../i18n/language-provider";

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

const PAGE_SIZE = 50;

type ProductListResponse = {
  items: ProductRecord[];
  page: number;
  limit: number;
  total: number;
};

/** C4.3 — catálogo de produtos. */
export function ProductsView({ accessToken, canWrite }: ProductsViewProps) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (query) params.set("q", query);
      try {
        const result = await apiRequest<ProductListResponse>(
          `/products?${params.toString()}`,
          { accessToken }
        );
        if (active) {
          setProducts(result.items);
          setTotal(result.total);
          const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
          if (page > lastPage) setPage(lastPage);
        }
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
  }, [accessToken, page, query, refresh]);

  function openCreate() {
    setError("");
    setImportOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setFormMode("create");
  }

  function openEdit(product: ProductRecord) {
    setError("");
    setImportOpen(false);
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
    const unitPrice = normalizeDecimal(form.unitPrice);
    if (!code || !name || !unitPrice) {
      setError(t("Informe código, nome e preço."));
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
      if (products.length === 1 && page > 1) {
        setPage(current => current - 1);
      }
      setRefresh(current => current + 1);
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
          <p className="companies-view__eyebrow">{t("Catálogo")}</p>
          <h1 id="products-title">{t("Produtos")}</h1>
          <p>{t("Produtos e serviços usados para compor oportunidades.")}</p>
        </div>
        {canWrite ? (
          <div className="companies-view__header-actions">
            <button
              type="button"
              onClick={() => {
                closeForm();
                setImportOpen(true);
              }}
            >
              {t("Importar CSV")}
            </button>
            <button
              type="button"
              className="button companies-view__primary"
              onClick={openCreate}
            >
              {t("Novo produto")}
            </button>
          </div>
        ) : null}
      </header>

      <form
        className="companies-view__toolbar"
        role="search"
        onSubmit={event => {
          event.preventDefault();
          setPage(1);
          setQuery(queryInput.trim());
        }}
      >
        <label>
          <span>{t("Buscar produtos")}</span>
          <input
            type="search"
            aria-label={t("Buscar produtos")}
            placeholder={t("Código ou nome")}
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
        </label>
        <button type="submit">{t("Buscar")}</button>
      </form>

      {error ? (
        <p className="companies-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {importOpen && canWrite ? (
        <ProductImportPanel
          accessToken={accessToken}
          onClose={() => setImportOpen(false)}
          onImported={() => setRefresh(current => current + 1)}
        />
      ) : null}

      {formMode ? (
        <form
          className="company-form"
          aria-label={
            formMode === "create" ? t("Novo produto") : t("Editar produto")
          }
          onSubmit={submit}
        >
          <div className="company-form__heading">
            <div>
              <p>{formMode === "create" ? t("Novo cadastro") : t("Edição")}</p>
              <h2>
                {formMode === "create"
                  ? t("Novo produto")
                  : t("Editar produto")}
              </h2>
            </div>
            <button type="button" onClick={closeForm}>
              {t("Cancelar")}
            </button>
          </div>
          <div className="company-form__fields">
            <label>
              <span>{t("Código")}</span>
              <input
                value={form.code}
                onChange={event =>
                  setForm(current => ({ ...current, code: event.target.value }))
                }
              />
            </label>
            <label>
              <span>{t("Nome")}</span>
              <input
                value={form.name}
                onChange={event =>
                  setForm(current => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>{t("Preço unitário")}</span>
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
              <span>{t("Descrição")}</span>
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
              <span>{t("Ativo")}</span>
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
            {submitting ? t("Salvando...") : t("Salvar produto")}
          </button>
        </form>
      ) : null}

      {loading ? <p>{t("Carregando produtos...")}</p> : null}

      {!loading && products.length === 0 ? (
        <p>{t("Nenhum produto encontrado.")}</p>
      ) : null}

      {!loading && products.length > 0 ? (
        <>
          <div
            className="company-import__table-wrapper"
            role="region"
            aria-label={t("Tabela: Produtos")}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("Código")}</th>
                  <th>{t("Nome")}</th>
                  <th>{t("Preço")}</th>
                  <th>{t("Situação")}</th>
                  {canWrite ? <th aria-label={t("Ações")} /> : null}
                </tr>
              </thead>
              <tbody>
                {products.map(product => (
                  <tr key={product.id}>
                    <td>{product.code}</td>
                    <td>{product.name}</td>
                    <td>{formatMoney(product.unitPrice)}</td>
                    <td>{product.isActive ? t("Ativo") : t("Inativo")}</td>
                    {canWrite ? (
                      <td>
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          aria-label={t("Editar {0}", { 0: product.name })}
                        >
                          {t("Editar")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(product)}
                          aria-label={t("Excluir {0}", { 0: product.name })}
                        >
                          {t("Excluir")}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            className="crm-pagination"
            aria-label={t("Paginação de produtos")}
          >
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              {t("Anterior")}
            </button>
            <span>
              {t("Página ")}
              {page}
              {t(" de ")}
              {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total}
              {t(" produto(s)")}
            </span>
            <button
              type="button"
              disabled={page * PAGE_SIZE >= total || loading}
              onClick={() => setPage(current => current + 1)}
            >
              {t("Próxima")}
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
