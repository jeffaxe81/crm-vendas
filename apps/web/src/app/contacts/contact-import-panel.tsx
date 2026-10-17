"use client";

import type {
  ContactImportPreview,
  ContactImportResult,
} from "@axes/contracts";
import { type ChangeEvent, type RefObject, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type ContactImportPanelProps = {
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelected: () => void;
  accessToken: string;
  onClose: () => void;
  onImported: (result: ContactImportResult) => void | Promise<void>;
};

/** C4.2.2 — Preview → Confirmar da importação CSV de contatos. */
export function ContactImportPanel({
  accessToken,
  open,
  inputRef,
  onSelected,
  onClose,
  onImported,
}: ContactImportPanelProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactImportPreview | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected || busy) return;
    onSelected();
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError("");

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", selected);
      setPreview(
        await apiRequest<ContactImportPreview>("/contact-imports/preview", {
          accessToken,
          method: "POST",
          body,
        })
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível validar o arquivo CSV."
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!file || !preview || preview.valid === 0) {
      return;
    }

    setError("");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("fingerprint", preview.fingerprint);
      body.append("file", file);
      const confirmed = await apiRequest<ContactImportResult>(
        "/contact-imports/confirm",
        { accessToken, method: "POST", body }
      );
      setResult(confirmed);
      await onImported(confirmed);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível confirmar a importação."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        aria-label={t("Arquivo CSV de contatos")}
        type="file"
        accept=".csv,text/csv"
        hidden
        disabled={busy}
        onChange={event => void previewImport(event)}
      />
      {open ? (
        <section
          className="company-import"
          aria-label={t("Importar contatos por CSV")}
        >
          <div className="company-form__heading">
            <div>
              <p>{t("Importação")}</p>
              <h2>{t("Importar contatos por CSV")}</h2>
            </div>
            <button type="button" onClick={onClose}>
              {t("Fechar")}
            </button>
          </div>

          <p>
            {t("Colunas aceitas: ")}
            <code>{t("fullName")}</code>
            {t(" (obrigatória),")} <code>{t("jobTitle")}</code>,{" "}
            <code>{t("email")}</code>, <code>{t("phone")}</code>,{" "}
            <code>{t("mobile")}</code>, <code>{t("whatsapp")}</code>,{" "}
            <code>{t("notes")}</code>
            {t(" e")} <code>{t("companyDocument")}</code>
            {t(
              " (documento de uma empresa já cadastrada para vincular o contato). Até 500 linhas."
            )}
          </p>

          <p>{file?.name}</p>

          {error ? (
            <p className="contacts-view__error" role="alert">
              {t(error)}
            </p>
          ) : null}

          {busy && !preview ? <p>{t("Validando arquivo...")}</p> : null}

          {preview && !result ? (
            <>
              <p>
                {preview.valid}
                {t(" válida(s) · ")}
                {preview.invalid}
                {t(" inválida(s)")}
              </p>
              <div
                className="company-import__table-wrapper"
                role="region"
                aria-label={t("Tabela: Prévia de contatos")}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{t("Linha")}</th>
                      <th>{t("Contato")}</th>
                      <th>{t("E-mail")}</th>
                      <th>{t("Empresa")}</th>
                      <th>{t("Status")}</th>
                      <th>{t("Erros")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(row => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.data.fullName ?? "—"}</td>
                        <td>{row.data.email ?? "—"}</td>
                        <td>
                          {row.company?.legalName ??
                            row.data.companyDocument ??
                            "—"}
                        </td>
                        <td>
                          {row.status === "VALID" ? t("Válida") : t("Inválida")}
                        </td>
                        <td>{row.errors.join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="button"
                disabled={busy || preview.valid === 0}
                onClick={() => void confirmImport()}
              >
                {busy ? t("Importando...") : t("Confirmar importação")}
              </button>
            </>
          ) : null}

          {result ? (
            <p role="status">
              {result.imported}
              {t(" importado(s) · ")}
              {result.rejected}
              {t(" rejeitado(s)")}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
