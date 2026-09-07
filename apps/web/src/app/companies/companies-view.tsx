"use client";

import type {
  CompanyCreateInput,
  CompanyUpdateInput,
} from "@axes/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type CompanyRecord = {
  id: string;
  organizationId: string;
  legalName: string;
  tradeName: string | null;
  document: string | null;
  website: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type CompanyListResponse = {
  items: CompanyRecord[];
  page: number;
  limit: number;
  total: number;
};

type CompanyFormState = {
  legalName: string;
  tradeName: string;
};

type CompaniesViewProps = {
  accessToken: string;
};

const emptyForm: CompanyFormState = {
  legalName: "",
  tradeName: "",
};

export function CompaniesView({ accessToken }: CompaniesViewProps) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCompanies() {
      setLoading(true);
      setError("");

      try {
        const result = await apiRequest<CompanyListResponse>(
          "/companies?page=1&limit=20",
          { accessToken }
        );
        if (active) {
          setCompanies(result.items);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as empresas."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCompanies();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const visibleCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedQuery) {
      return companies;
    }

    return companies.filter(company =>
      [company.legalName, company.tradeName ?? ""].some(value =>
        value.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
      )
    );
  }, [companies, query]);

  function openCreate() {
    setError("");
    setForm(emptyForm);
    setEditingId(null);
    setFormMode("create");
  }

  function openEdit(company: CompanyRecord) {
    setError("");
    setForm({
      legalName: company.legalName,
      tradeName: company.tradeName ?? "",
    });
    setEditingId(company.id);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submitCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const legalName = form.legalName.trim();
    if (!legalName) {
      setError("Informe a razão social.");
      return;
    }

    setSubmitting(true);

    try {
      if (formMode === "create") {
        const payload: CompanyCreateInput = {
          legalName,
          ...(form.tradeName.trim()
            ? { tradeName: form.tradeName.trim() }
            : {}),
        };
        const created = await apiRequest<CompanyRecord>("/companies", {
          accessToken,
          method: "POST",
          body: payload,
        });
        setCompanies(current => [...current, created]);
        setQuery("");
        closeForm();
        return;
      }

      if (formMode === "edit" && editingId) {
        const payload: CompanyUpdateInput = {
          legalName,
          ...(form.tradeName.trim()
            ? { tradeName: form.tradeName.trim() }
            : {}),
        };
        const updated = await apiRequest<CompanyRecord>(
          `/companies/${editingId}`,
          {
            accessToken,
            method: "PATCH",
            body: payload,
          }
        );
        setCompanies(current =>
          current.map(company =>
            company.id === updated.id ? updated : company
          )
        );
        closeForm();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a empresa."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="companies-view" aria-labelledby="companies-title">
      <header className="companies-view__header">
        <div>
          <p className="companies-view__eyebrow">Relacionamento</p>
          <h1 id="companies-title">Empresas</h1>
          <p>Cadastre e mantenha as organizações da sua base comercial.</p>
        </div>
        <button className="button companies-view__primary" onClick={openCreate}>
          Nova empresa
        </button>
      </header>

      <div className="companies-view__toolbar">
        <label>
          <span>Buscar empresas</span>
          <input
            type="search"
            aria-label="Buscar empresas"
            placeholder="Razão social ou nome fantasia"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <span>{companies.length} empresa(s)</span>
      </div>

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {formMode ? (
        <form
          className="company-form"
          aria-label={formMode === "create" ? "Nova empresa" : "Editar empresa"}
          onSubmit={submitCompany}
        >
          <div className="company-form__heading">
            <div>
              <p>{formMode === "create" ? "Novo cadastro" : "Edição"}</p>
              <h2>
                {formMode === "create" ? "Nova empresa" : "Editar empresa"}
              </h2>
            </div>
            <button type="button" onClick={closeForm}>
              Cancelar
            </button>
          </div>

          <div className="company-form__fields">
            <label>
              <span>Razão social</span>
              <input
                value={form.legalName}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              <span>Nome fantasia</span>
              <input
                value={form.tradeName}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    tradeName: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button className="button company-form__submit" disabled={submitting}>
            {submitting
              ? "Salvando..."
              : formMode === "create"
                ? "Salvar empresa"
                : "Salvar alterações"}
          </button>
        </form>
      ) : null}

      {loading ? <p className="companies-view__status">Carregando empresas...</p> : null}

      {!loading && visibleCompanies.length === 0 ? (
        <div className="companies-view__empty">
          <strong>Nenhuma empresa encontrada.</strong>
          <span>Ajuste a busca ou crie um novo cadastro.</span>
        </div>
      ) : null}

      <div className="companies-view__grid">
        {visibleCompanies.map(company => (
          <article className="company-card" key={company.id}>
            <div>
              <p className="company-card__eyebrow">Empresa</p>
              <h2>{company.legalName}</h2>
              {company.tradeName ? <p>{company.tradeName}</p> : null}
            </div>
            <button type="button" onClick={() => openEdit(company)}>
              Editar
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
