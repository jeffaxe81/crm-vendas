"use client";

import { Fragment, FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { TerritoryDetailPanel } from "./territory-detail-panel";
import { useTranslation } from "../../i18n/language-provider";

export type TerritoryRecord = {
  id: string;
  name: string;
  region: string;
  description: string | null;
  salesRepId: string | null;
  salesRep?: { id: string; displayName: string } | null;
  version: number;
};

type SalesRepOption = {
  id: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "SELLER";
};

type TerritoriesViewProps = {
  accessToken: string;
  canWrite: boolean;
};

type TerritoryForm = {
  name: string;
  region: string;
  description: string;
};

const emptyForm: TerritoryForm = { name: "", region: "", description: "" };

const PAGE_SIZE = 50;

type TerritoryListResponse = {
  items: TerritoryRecord[];
  page: number;
  limit: number;
  total: number;
};

/** C4.1.6 — territórios comerciais, cobertura e cotas. */
export function TerritoriesView({
  accessToken,
  canWrite,
}: TerritoriesViewProps) {
  const { t } = useTranslation();
  const [territories, setTerritories] = useState<TerritoryRecord[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<TerritoryRecord | null>(null);
  const [form, setForm] = useState<TerritoryForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<TerritoryRecord | null>(null);
  const [reassignValue, setReassignValue] = useState("");
  const [reassignError, setReassignError] = useState("");
  const [salesRepOptions, setSalesRepOptions] = useState<SalesRepOption[]>([]);
  const [loadingSalesReps, setLoadingSalesReps] = useState(false);

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
        const result = await apiRequest<TerritoryListResponse>(
          `/territories?${params.toString()}`,
          { accessToken }
        );
        if (active) {
          setTerritories(result.items);
          setTotal(result.total);
          const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
          if (page > lastPage) setPage(lastPage);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os territórios."
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
    setEditing(null);
    setForm(emptyForm);
    setFormMode("create");
  }

  function openEdit(territory: TerritoryRecord) {
    setError("");
    setEditing(territory);
    setForm({
      name: territory.name,
      region: territory.region,
      description: territory.description ?? "",
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
    const name = form.name.trim();
    const region = form.region.trim();
    if (!name || !region) {
      setError(t("Informe nome e região."));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const description = form.description.trim();
      if (formMode === "edit" && editing) {
        await apiRequest<TerritoryRecord>(`/territories/${editing.id}`, {
          accessToken,
          method: "PATCH",
          body: { name, region, description: description || undefined },
        });
      } else {
        await apiRequest<TerritoryRecord>("/territories", {
          accessToken,
          method: "POST",
          body: { name, region, ...(description ? { description } : {}) },
        });
      }
      closeForm();
      setRefresh(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o território."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(territory: TerritoryRecord) {
    setError("");
    try {
      await apiRequest<void>(`/territories/${territory.id}`, {
        accessToken,
        method: "DELETE",
      });
      if (territories.length === 1 && page > 1) {
        setPage(current => current - 1);
      }
      setRefresh(current => current + 1);
      if (expandedId === territory.id) {
        setExpandedId(null);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o território."
      );
    }
  }

  async function openReassign(territory: TerritoryRecord) {
    setReassignError("");
    setReassignValue(territory.salesRepId ?? "");
    setReassigning(territory);
    setLoadingSalesReps(true);
    try {
      const options = await apiRequest<SalesRepOption[]>(
        "/territories/sales-reps",
        { accessToken }
      );
      setSalesRepOptions(options);
    } catch (cause) {
      setReassignError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os vendedores disponíveis."
      );
    } finally {
      setLoadingSalesReps(false);
    }
  }

  async function submitReassign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reassigning) return;
    const salesRepId = reassignValue.trim();
    if (!salesRepId) {
      setReassignError("Informe o identificador do vendedor.");
      return;
    }
    setReassignError("");
    try {
      const updated = await apiRequest<TerritoryRecord>(
        `/territories/${reassigning.id}/reassign`,
        { accessToken, method: "POST", body: { salesRepId } }
      );
      const selectedRep = salesRepOptions.find(
        option => option.id === updated.salesRepId
      );
      setTerritories(current =>
        current.map(item =>
          item.id === updated.id
            ? {
                ...updated,
                salesRep: selectedRep
                  ? { id: selectedRep.id, displayName: selectedRep.displayName }
                  : null,
              }
            : item
        )
      );
      setReassigning(null);
    } catch (cause) {
      setReassignError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reatribuir o território."
      );
    }
  }

  return (
    <section className="companies-view" aria-labelledby="territories-title">
      <header className="companies-view__header">
        <div>
          <p className="companies-view__eyebrow">{t("Comercial")}</p>
          <h1 id="territories-title">{t("Territórios")}</h1>
          <p>
            {t(
              "Territórios de venda, cobertura de empresas-alvo e cotas por período."
            )}
          </p>
        </div>
        {canWrite ? (
          <div className="companies-view__header-actions">
            <button
              type="button"
              className="button companies-view__primary"
              onClick={openCreate}
            >
              {t("Novo território")}
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
          <span>{t("Buscar territórios")}</span>
          <input
            type="search"
            aria-label={t("Buscar territórios")}
            placeholder={t("Nome do território")}
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

      {formMode ? (
        <form
          className="company-form"
          aria-label={
            formMode === "create"
              ? t("Novo território")
              : t("Editar território")
          }
          onSubmit={submit}
        >
          <div className="company-form__heading">
            <div>
              <p>{formMode === "create" ? t("Novo cadastro") : t("Edição")}</p>
              <h2>
                {formMode === "create"
                  ? t("Novo território")
                  : t("Editar território")}
              </h2>
            </div>
            <button type="button" onClick={closeForm}>
              {t("Cancelar")}
            </button>
          </div>
          <div className="company-form__fields">
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
              <span>{t("Região")}</span>
              <input
                value={form.region}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    region: event.target.value,
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
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? t("Salvando...") : t("Salvar território")}
          </button>
        </form>
      ) : null}

      {reassigning ? (
        <form
          className="company-form"
          aria-label={t("Atribuir vendedor a {0}", { 0: reassigning.name })}
          onSubmit={submitReassign}
        >
          <div className="company-form__heading">
            <div>
              <p>{t("Reatribuição")}</p>
              <h2>
                {t("Atribuir vendedor — ")}
                {reassigning.name}
              </h2>
            </div>
            <button type="button" onClick={() => setReassigning(null)}>
              {t("Cancelar")}
            </button>
          </div>
          <div className="company-form__fields">
            <label>
              <span>{t("Vendedor")}</span>
              <select
                aria-label={t("Vendedor")}
                value={reassignValue}
                disabled={loadingSalesReps}
                onChange={event => setReassignValue(event.target.value)}
              >
                <option value="">
                  {loadingSalesReps
                    ? t("Carregando vendedores...")
                    : t("Selecione um vendedor")}
                </option>
                {salesRepOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {reassignError ? (
            <p className="companies-view__error" role="alert">
              {reassignError}
            </p>
          ) : null}
          <button className="button" type="submit">
            {t("Confirmar atribuição")}
          </button>
        </form>
      ) : null}

      {loading ? <p>{t("Carregando territórios...")}</p> : null}

      {!loading && territories.length === 0 ? (
        <p>{t("Nenhum território encontrado.")}</p>
      ) : null}

      {!loading && territories.length > 0 ? (
        <>
          <div
            className="company-import__table-wrapper"
            role="region"
            aria-label={t("Tabela: Territórios")}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("Nome")}</th>
                  <th>{t("Região")}</th>
                  <th>{t("Vendedor")}</th>
                  {canWrite ? <th aria-label={t("Ações")} /> : null}
                </tr>
              </thead>
              <tbody>
                {territories.map(territory => (
                  <Fragment key={territory.id}>
                    <tr>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(current =>
                              current === territory.id ? null : territory.id
                            )
                          }
                        >
                          {expandedId === territory.id ? "▾" : "▸"}{" "}
                          {territory.name}
                        </button>
                      </td>
                      <td>{territory.region}</td>
                      <td>
                        {territory.salesRep?.displayName ??
                          (territory.salesRepId
                            ? t("Vendedor indisponível")
                            : "—")}
                      </td>
                      {canWrite ? (
                        <td>
                          <button
                            type="button"
                            onClick={() => openEdit(territory)}
                            aria-label={t("Editar {0}", { 0: territory.name })}
                          >
                            {t("Editar")}
                          </button>
                          <button
                            type="button"
                            onClick={() => openReassign(territory)}
                            aria-label={t("Atribuir vendedor a {0}", {
                              0: territory.name,
                            })}
                          >
                            {t("Atribuir vendedor")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(territory)}
                            aria-label={t("Excluir {0}", { 0: territory.name })}
                          >
                            {t("Excluir")}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {expandedId === territory.id ? (
                      <tr>
                        <td colSpan={canWrite ? 4 : 3}>
                          <TerritoryDetailPanel
                            accessToken={accessToken}
                            territoryId={territory.id}
                            canWrite={canWrite}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            className="crm-pagination"
            aria-label={t("Paginação de territórios")}
          >
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setExpandedId(null);
                setPage(current => Math.max(1, current - 1));
              }}
            >
              {t("Anterior")}
            </button>
            <span>
              {t("Página ")}
              {page}
              {t(" de ")}
              {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total}
              {t(" território(s)")}
            </span>
            <button
              type="button"
              disabled={page * PAGE_SIZE >= total || loading}
              onClick={() => {
                setExpandedId(null);
                setPage(current => current + 1);
              }}
            >
              {t("Próxima")}
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
