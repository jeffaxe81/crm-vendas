"use client";

import { useEffect, useState, type FormEvent } from "react";

import { apiDownload, apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type KnowledgeType = "NOTE" | "LINK" | "DOCUMENT";
type KnowledgeAccess = "ORGANIZATION" | "PRIVATE";

type KnowledgeRecord = {
  id: string;
  type: KnowledgeType;
  title: string;
  category: string | null;
  source: string | null;
  accessLevel: KnowledgeAccess;
  noteContent: string | null;
  url: string | null;
  originalFileName: string | null;
  sizeBytes: number | null;
  aiStatus: "UNPROCESSED" | "READY" | "FAILED";
  companyIds: string[];
  contactIds: string[];
  opportunityIds: string[];
  createdAt: string;
  version: number;
};

type KnowledgePage = {
  items: KnowledgeRecord[];
  total: number;
  page: number;
  limit: number;
};

type FormState = {
  type: KnowledgeType;
  title: string;
  category: string;
  source: string;
  accessLevel: KnowledgeAccess;
  noteContent: string;
  url: string;
};

const initialForm: FormState = {
  type: "NOTE",
  title: "",
  category: "",
  source: "",
  accessLevel: "ORGANIZATION",
  noteContent: "",
  url: "",
};

const typeNames: Record<KnowledgeType, string> = {
  NOTE: "Nota",
  LINK: "Link",
  DOCUMENT: "Documento",
};

async function encodeFile(file: File): Promise<string> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("O documento deve ter entre 1 byte e 10 MiB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function KnowledgeView({
  accessToken,
  canWrite,
}: {
  accessToken: string;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<KnowledgeRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"ALL" | KnowledgeType>("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeRecord | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (query) params.set("q", query);
      if (type !== "ALL") params.set("type", type);
      try {
        const response = await apiRequest<KnowledgePage>(
          "/knowledge?" + params.toString(),
          { accessToken }
        );
        if (!active) return;
        setItems(response.items);
        setTotal(response.total);
      } catch (cause) {
        if (active)
          setError(
            errorText(cause, "Não foi possível carregar o conhecimento.")
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, page, query, type, refresh]);

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setFile(null);
    setError("");
    setEditorOpen(true);
  }

  function openEdit(record: KnowledgeRecord) {
    setEditing(record);
    setForm({
      type: record.type,
      title: record.title,
      category: record.category ?? "",
      source: record.source ?? "",
      accessLevel: record.accessLevel,
      noteContent: record.noteContent ?? "",
      url: record.url ?? "",
    });
    setFile(null);
    setError("");
    setEditorOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canWrite) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const title = form.title.trim();
      if (!title) throw new Error("Informe o título.");
      const metadata = {
        title,
        category: form.category.trim() || null,
        source: form.source.trim() || null,
        accessLevel: form.accessLevel,
      };
      let body: Record<string, unknown>;
      if (editing) {
        body = { ...metadata };
        if (editing.type === "NOTE") body.noteContent = form.noteContent.trim();
        if (editing.type === "LINK") body.url = form.url.trim();
        await apiRequest("/knowledge/" + editing.id, {
          accessToken,
          method: "PATCH",
          body,
        });
      } else {
        body = {
          ...metadata,
          category: metadata.category ?? undefined,
          source: metadata.source ?? undefined,
          type: form.type,
        };
        if (form.type === "NOTE") {
          body.noteContent = form.noteContent.trim();
        } else if (form.type === "LINK") {
          body.url = form.url.trim();
        } else {
          if (!file) throw new Error("Selecione um documento.");
          body.document = {
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            base64: await encodeFile(file),
          };
        }
        await apiRequest("/knowledge", {
          accessToken,
          method: "POST",
          body,
        });
      }
      setEditorOpen(false);
      setEditing(null);
      setFile(null);
      setPage(1);
      setRefresh(value => value + 1);
      setNotice(editing ? "Registro atualizado." : "Registro criado.");
    } catch (cause) {
      setError(errorText(cause, "Não foi possível salvar o registro."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(record: KnowledgeRecord) {
    if (busy || !canWrite) return;
    if (!window.confirm("Excluir " + record.title + "?")) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/knowledge/" + record.id, {
        accessToken,
        method: "DELETE",
      });
      setPage(1);
      setRefresh(value => value + 1);
      setNotice("Registro excluído.");
    } catch (cause) {
      setError(errorText(cause, "Não foi possível excluir o registro."));
    } finally {
      setBusy(false);
    }
  }

  async function download(record: KnowledgeRecord) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { bytes, fileName } = await apiDownload(
        "/knowledge/" + record.id + "/document",
        accessToken
      );
      const url = URL.createObjectURL(bytes);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(errorText(cause, "Não foi possível baixar o documento."));
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="knowledge-hub" aria-label={t("Hub de conhecimento")}>
      <header className="knowledge-hub__header">
        <div>
          <p className="knowledge-hub__eyebrow">{t("Conhecimento")}</p>
          <h1>{t("Hub de conhecimento")}</h1>
          <p>
            {t(
              "Notas, links e documentos organizados por equipe, sem exposição entre empresas."
            )}
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="crm-button crm-button--default"
            onClick={openCreate}
          >
            {t("Novo registro")}
          </button>
        ) : null}
      </header>

      <form
        className="knowledge-hub__filters"
        onSubmit={event => {
          event.preventDefault();
          setPage(1);
          setQuery(searchText.trim());
        }}
      >
        <label>
          {t("Pesquisar")}
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder={t("Título, categoria ou origem")}
          />
        </label>
        <label>
          {t("Tipo")}
          <select
            value={type}
            onChange={event => {
              setType(event.target.value as "ALL" | KnowledgeType);
              setPage(1);
            }}
          >
            <option value="ALL">{t("Todos")}</option>
            <option value="NOTE">{t("Notas")}</option>
            <option value="LINK">{t("Links")}</option>
            <option value="DOCUMENT">{t("Documentos")}</option>
          </select>
        </label>
        <button className="crm-button crm-button--outline" type="submit">
          {t("Buscar")}
        </button>
      </form>

      {error ? (
        <p className="knowledge-hub__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="knowledge-hub__notice" role="status">
          {notice}
        </p>
      ) : null}
      {loading ? <p role="status">{t("Carregando registros...")}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="knowledge-hub__empty">
          {t("Nenhum registro encontrado.")}
        </p>
      ) : null}

      <div className="knowledge-hub__list">
        {items.map(record => (
          <article key={record.id} className="knowledge-hub__item">
            <div className="knowledge-hub__item-header">
              <span className="knowledge-hub__type">
                {t(typeNames[record.type])}
              </span>
              <span className="knowledge-hub__access">
                {record.accessLevel === "PRIVATE"
                  ? t("Privado")
                  : t("Organização")}
              </span>
            </div>
            <h2>{record.title}</h2>
            {record.type === "NOTE" && record.noteContent ? (
              <p className="knowledge-hub__excerpt">{record.noteContent}</p>
            ) : null}
            {record.type === "LINK" && record.url ? (
              <a href={record.url} target="_blank" rel="noopener noreferrer">
                {record.url}
              </a>
            ) : null}
            {record.type === "DOCUMENT" ? (
              <p>
                {record.originalFileName} — {record.sizeBytes ?? 0} bytes
              </p>
            ) : null}
            <p className="knowledge-hub__metadata">
              {[record.category, record.source].filter(Boolean).join(" · ")}
              {record.aiStatus !== "UNPROCESSED"
                ? " · IA: " + record.aiStatus
                : ""}
            </p>
            {record.companyIds.length +
              record.contactIds.length +
              record.opportunityIds.length >
            0 ? (
              <p className="knowledge-hub__links">
                {record.companyIds.length} empresa(s) ·{" "}
                {record.contactIds.length} contato(s) ·{" "}
                {record.opportunityIds.length} oportunidade(s)
              </p>
            ) : null}
            <div className="knowledge-hub__actions">
              {record.type === "DOCUMENT" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void download(record)}
                >
                  {t("Baixar")}
                </button>
              ) : null}
              {canWrite ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEdit(record)}
                  >
                    {t("Editar")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(record)}
                  >
                    {t("Excluir")}
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!loading && totalPages > 1 ? (
        <nav className="knowledge-hub__pagination" aria-label={t("Paginação")}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("Anterior")}
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t("Próxima")}
          </button>
        </nav>
      ) : null}

      {canWrite && editorOpen ? (
        <div className="knowledge-hub__editor">
          <h2>{editing ? t("Editar registro") : t("Novo registro")}</h2>
          <form onSubmit={event => void save(event)}>
            {!editing ? (
              <label>
                {t("Tipo")}
                <select
                  value={form.type}
                  onChange={event =>
                    setForm(value => ({
                      ...value,
                      type: event.target.value as KnowledgeType,
                    }))
                  }
                >
                  <option value="NOTE">{t("Nota")}</option>
                  <option value="LINK">{t("Link")}</option>
                  <option value="DOCUMENT">{t("Documento")}</option>
                </select>
              </label>
            ) : null}
            <label>
              {t("Título")}
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={event =>
                  setForm(value => ({ ...value, title: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Categoria")}
              <input
                maxLength={120}
                value={form.category}
                onChange={event =>
                  setForm(value => ({ ...value, category: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Origem")}
              <input
                maxLength={200}
                value={form.source}
                onChange={event =>
                  setForm(value => ({ ...value, source: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Acesso")}
              <select
                value={form.accessLevel}
                onChange={event =>
                  setForm(value => ({
                    ...value,
                    accessLevel: event.target.value as KnowledgeAccess,
                  }))
                }
              >
                <option value="ORGANIZATION">{t("Organização")}</option>
                <option value="PRIVATE">{t("Privado")}</option>
              </select>
            </label>
            {form.type === "NOTE" ? (
              <label>
                {t("Conteúdo da nota")}
                <textarea
                  required
                  rows={4}
                  maxLength={100000}
                  value={form.noteContent}
                  onChange={event =>
                    setForm(value => ({
                      ...value,
                      noteContent: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
            {form.type === "LINK" ? (
              <label>
                {t("URL HTTP/HTTPS")}
                <input
                  type="url"
                  required
                  value={form.url}
                  onChange={event =>
                    setForm(value => ({ ...value, url: event.target.value }))
                  }
                />
              </label>
            ) : null}
            {form.type === "DOCUMENT" && !editing ? (
              <label>
                {t("Arquivo (até 10 MiB)")}
                <input
                  type="file"
                  required
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
            ) : null}
            <div className="knowledge-hub__actions">
              <button
                className="crm-button crm-button--default"
                type="submit"
                disabled={busy}
              >
                {busy ? t("Salvando...") : t("Salvar")}
              </button>
              <button
                className="crm-button crm-button--outline"
                type="button"
                disabled={busy}
                onClick={() => setEditorOpen(false)}
              >
                {t("Cancelar")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
