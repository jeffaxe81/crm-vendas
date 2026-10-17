"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";

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
  useRef,
  useState,
} from "react";

import { Button } from "../../components/ui/button";
import { apiRequest } from "../../lib/api-client";
import { FileUp, Pencil, Plus, X } from "lucide-react";
import { useTranslation } from "../../i18n/language-provider";

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
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const saveFeedback = useSaveFeedback();
  const [submitting, setSubmitting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
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
    if (!importing) {
      importInput.current?.click();
    }
  }

  function closeImport() {
    setImportOpen(false);
    resetImportState();
  }

  function openCreate() {
    saveFeedback.reset();
    setError("");
    closeImport();
    setForm(emptyForm);
    setEditingId(null);
    setFormMode("create");
  }

  function openEdit(company: CompanyRecord) {
    saveFeedback.reset();
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
    event.target.value = "";
    if (!file || importing || !canWrite) {
      return;
    }

    closeForm();
    setImportOpen(true);
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setError("");

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
      setError(t("Informe a razão social."));
      return;
    }

    setSubmitting(true);

    if (!saveFeedback.start()) return;
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
        saveFeedback.saved();
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
        saveFeedback.saved();
        closeForm();
      }
    } catch (cause) {
      saveFeedback.failed();
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
          <p className="companies-view__eyebrow">{t("Relacionamento")}</p>
          <h1 id="companies-title">{t("Empresas")}</h1>
          <p>
            {t("Cadastre e mantenha as organizações da sua base comercial.")}
          </p>
        </div>
        <div className="companies-view__header-actions">
          {canWrite ? (
            <Button variant="outline" onClick={openImport} disabled={importing}>
              <FileUp aria-hidden="true" />
              {t("Importar CSV")}
            </Button>
          ) : null}
          <Button className="companies-view__primary" onClick={openCreate}>
            <Plus aria-hidden="true" />
            {t("Nova empresa")}
          </Button>
        </div>
      </header>

      <div className="companies-view__toolbar">
        <label>
          <span>{t("Buscar empresas")}</span>
          <input
            type="search"
            aria-label={t("Buscar empresas")}
            placeholder={t("Razão social ou nome fantasia")}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <span>
          {companies.length}
          {t(" empresa(s)")}
        </span>
      </div>

      {error ? (
        <p className="companies-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {canWrite ? (
        <input
          ref={importInput}
          aria-label={t("Arquivo CSV")}
          type="file"
          accept=".csv,text/csv"
          hidden
          disabled={importing}
          onChange={event => void previewImport(event)}
        />
      ) : null}

      {importOpen ? (
        <section
          className="company-import"
          aria-label={t("Importar empresas por CSV")}
        >
          <div className="company-form__heading">
            <div>
              <p>{t("Importação")}</p>
              <h2>{t("Importar empresas por CSV")}</h2>
            </div>
            <Button variant="outline" size="sm" onClick={closeImport}>
              <X aria-hidden="true" />
              {t("Fechar")}
            </Button>
          </div>

          <p>{importFile?.name}</p>

          {importing && !importPreview ? (
            <p>{t("Validando arquivo...")}</p>
          ) : null}

          {importPreview && !importResult ? (
            <>
              <p>
                {importPreview.valid}
                {t(" válida(s) · ")}
                {importPreview.invalid} {t("inválida(s)")}
              </p>
              <div
                className="company-import__table-wrapper"
                role="region"
                aria-label={t("Tabela: Prévia de empresas")}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{t("Linha")}</th>
                      <th>{t("Empresa")}</th>
                      <th>{t("Status")}</th>
                      <th>{t("Erros")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map(row => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.data.legalName ?? "—"}</td>
                        <td>
                          {row.status === "VALID" ? t("Válida") : t("Inválida")}
                        </td>
                        <td>{row.errors.join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                className="company-import__confirm"
                disabled={importing || importPreview.valid === 0}
                onClick={() => void confirmImport()}
              >
                {importing ? t("Importando...") : t("Confirmar importação")}
              </Button>
            </>
          ) : null}

          {importResult ? (
            <p>
              {importResult.imported}
              {t(" importada(s) · ")}
              {importResult.rejected} {t("rejeitada(s)")}
            </p>
          ) : null}
        </section>
      ) : null}

      {formMode ? (
        <form
          className="company-form"
          aria-label={
            formMode === "create" ? t("Nova empresa") : t("Editar empresa")
          }
          onSubmit={submitCompany}
        >
          <div className="company-form__heading">
            <div>
              <p>{formMode === "create" ? t("Novo cadastro") : t("Edição")}</p>
              <h2>
                {formMode === "create"
                  ? t("Nova empresa")
                  : t("Editar empresa")}
              </h2>
            </div>
            <Button variant="outline" size="sm" onClick={closeForm}>
              <X aria-hidden="true" />
              {t("Cancelar")}
            </Button>
          </div>

          <div className="company-form__fields">
            <label>
              <span>{t("Razão social")}</span>
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
              <span>{t("Nome fantasia")}</span>
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

          <SaveButton
            className="crm-button crm-button--default company-form__submit"
            type="submit"
            disabled={submitting}
            status={saveFeedback.status}
            label={
              formMode === "create"
                ? t("Salvar empresa")
                : t("Salvar alterações")
            }
          />
        </form>
      ) : null}

      <SaveNotice status={saveFeedback.status} label={t("Empresa salva.")} />
      {loading ? (
        <p className="companies-view__status">{t("Carregando empresas...")}</p>
      ) : null}

      {!loading && visibleCompanies.length === 0 ? (
        <div className="companies-view__empty">
          <strong>{t("Nenhuma empresa encontrada.")}</strong>
          <span>{t("Ajuste a busca ou crie um novo cadastro.")}</span>
        </div>
      ) : null}

      <div className="companies-view__grid">
        {visibleCompanies.map(company => (
          <article className="company-card" key={company.id}>
            <div>
              <p className="company-card__eyebrow">{t("Empresa")}</p>
              <h2>{company.legalName}</h2>
              {company.tradeName ? <p>{company.tradeName}</p> : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEdit(company)}
            >
              <Pencil aria-hidden="true" />
              {t("Editar")}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
