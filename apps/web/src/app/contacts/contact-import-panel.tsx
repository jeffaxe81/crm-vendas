"use client";

import type {
  ContactImportPreview,
  ContactImportResult,
} from "@axes/contracts";
import { type ChangeEvent, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type ContactImportPanelProps = {
  accessToken: string;
  onClose: () => void;
  onImported: (result: ContactImportResult) => void | Promise<void>;
};

/** C4.2.2 — Preview → Confirmar da importação CSV de contatos. */
export function ContactImportPanel({
  accessToken,
  onClose,
  onImported,
}: ContactImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactImportPreview | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError("");

    if (!selected) {
      return;
    }

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
    <section className="company-import" aria-label="Importar contatos por CSV">
      <div className="company-form__heading">
        <div>
          <p>Importação</p>
          <h2>Importar contatos por CSV</h2>
        </div>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      <p>
        Colunas aceitas: <code>fullName</code> (obrigatória),{" "}
        <code>jobTitle</code>, <code>email</code>, <code>phone</code>,{" "}
        <code>mobile</code>, <code>whatsapp</code> e <code>notes</code>. Até 500
        linhas.
      </p>

      <label>
        <span>Arquivo CSV</span>
        <input
          aria-label="Arquivo CSV de contatos"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={event => void previewImport(event)}
        />
      </label>

      {error ? (
        <p className="contacts-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {busy && !preview ? <p>Validando arquivo...</p> : null}

      {preview && !result ? (
        <>
          <p>
            {preview.valid} válida(s) · {preview.invalid} inválida(s)
          </p>
          <div className="company-import__table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Contato</th>
                  <th>E-mail</th>
                  <th>Empresa</th>
                  <th>Status</th>
                  <th>Erros</th>
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
            disabled={busy || preview.valid === 0}
            onClick={() => void confirmImport()}
          >
            {busy ? "Importando..." : "Confirmar importação"}
          </button>
        </>
      ) : null}

      {result ? (
        <p role="status">
          {result.imported} importado(s) · {result.rejected} rejeitado(s)
        </p>
      ) : null}
    </section>
  );
}
