"use client";

import type {
  CompanyCreateInput,
  CompanyImportPreview,
  CompanyImportResult,
  CompanyUpdateInput,
} from "@axes/contracts";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  canWrite?: boolean;
};

const emptyForm: CompanyFormState = {
  legalName: "",
  tradeName: "",
};

function requestCompanies(accessToken: string): Promise<CompanyListResponse> {
  return apiRequest<CompanyListResponse>("/companies?page=1&limit=20", {
    accessToken,
  });
}

export function CompaniesView({
  accessToken,
  canWrite = true,
}: CompaniesViewProps) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] =
    useState<CompanyImportPreview | null>(null);
  const [importResult, setImportResult] = useState<CompanyImportResult | null>(
    null
  );
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCompanies() {
      setLoading(true);
      setError("");

      try {
        const result = await requestCompanies(accessToken);
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

  function resetImportState() {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImporting(false);
  }

  function openImport() {
    setError("");
    closeForm();
    resetImportState();
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    resetImportState();
  }

  function openCreate() {
    setError("");
    closeImport();
    setForm(emptyForm);
    setEditingId(null);
    setFormMode("create");
  }

  function openEdit(company: CompanyRecord) {
    setError("");
    closeImport();
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

  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setError("");

    if (!file) {
      return;
    }

    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const preview = await apiRequest<CompanyImportPreview>(
        "/company-imports/preview",
        {
          accessToken,
          method: "POST",
          body,
        }
      );
      setImportPreview(preview);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível validar o arquivo CSV."
      );
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    if (!importFile || !importPreview || importPreview.valid === 0) {
      return;
    }

    setError("");
    setImporting(true);
    try {
      const body = new FormData();
      body.append("fingerprint", importPreview.fingerprint);
      body.append("file", importFile);

      const result = await apiRequest<CompanyImportResult>(
        "/company-imports/confirm",
        {
          accessToken,
          method: "POST",
          body,
        }
      );
      setImportResult(result);

      const refreshed = await requestCompanies(accessToken);
      setCompanies(refreshed.items);
      setQuery("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível confirmar a importação."
      );
    } finally {
      setImporting(false);
    }
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
        <div className="companies-view__header-actions">
          {canWrite ? (
            <button type="button" onClick={openImport}>
              Importar CSV
            </button>
          ) : null}
          <button className="button companies-view__primary" onClick={openCreate}>
            Nova empresa
          </button>
        </div>
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

      {importOpen ? (
        <section className="company-import" aria-label="Importar empresas por CSV">
          <div className="company-form__heading">
            <div>
              <p>Importação</p>
              <h2>Importar empresas por CSV</h2>
            </div>
            <button type="button" onClick={closeImport}>
              Fechar
            </button>
          </div>

          <label>
            <span>Arquivo CSV</span>
            <input
              aria-label="Arquivo CSV"
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              onChange={event => void previewImport(event)}
            />
          </label>

          {importing && !importPreview ? <p>Validando arquivo...</p> : null}

          {importPreview && !importResult ? (
            <>
              <p>
                {importPreview.valid} válida(s) · {importPreview.invalid} inválida(s)
              </p>
              <div className="company-import__table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Empresa</th>
                      <th>Status</th>
                      <th>Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map(row => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.data.legalName ?? "—"}</td>
                        <td>{row.status === "VALID" ? "Válida" : "Inválida"}</td>
                        <td>{row.errors.join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="button"
                disabled={importing || importPreview.valid === 0}
                onClick={() => void confirmImport()}
              >
                {importing ? "Importando..." : "Confirmar importação"}
              </button>
            </>
          ) : null}

          {importResult ? (
            <p>
              {importResult.imported} importada(s) · {importResult.rejected} rejeitada(s)
            </p>
          ) : null}
        </section>
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

      {loading ? (
        <p className="companies-view__status">Carregando empresas...</p>
      ) : null}

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
