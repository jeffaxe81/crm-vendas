"use client";

import type {
  ProductImportPreview,
  ProductImportResult,
} from "@axes/contracts";
import { type ChangeEvent, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { formatMoney } from "../opportunities/opportunity-items-panel";

type ProductImportPanelProps = {
  accessToken: string;
  onClose: () => void;
  onImported: (result: ProductImportResult) => void | Promise<void>;
};

/** C4.3.2 — Preview → Confirmar da importação CSV de produtos. */
export function ProductImportPanel({
  accessToken,
  onClose,
  onImported,
}: ProductImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [result, setResult] = useState<ProductImportResult | null>(null);
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
        await apiRequest<ProductImportPreview>("/product-imports/preview", {
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
      const confirmed = await apiRequest<ProductImportResult>(
        "/product-imports/confirm",
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
    <section className="company-import" aria-label="Importar produtos por CSV">
      <div className="company-form__heading">
        <div>
          <p>Importação</p>
          <h2>Importar produtos por CSV</h2>
        </div>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      <p>
        Colunas aceitas: <code>code</code>, <code>name</code> e{" "}
        <code>unitPrice</code> (obrigatórias), <code>description</code> e{" "}
        <code>isActive</code> (true/false, sim/não ou 1/0; padrão ativo). Preço
        com ponto ou vírgula decimal. Até 500 linhas; códigos já cadastrados são
        rejeitados.
      </p>

      <label>
        <span>Arquivo CSV</span>
        <input
          aria-label="Arquivo CSV de produtos"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={event => void previewImport(event)}
        />
      </label>

      {error ? (
        <p className="companies-view__error" role="alert">
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
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Preço</th>
                  <th>Situação</th>
                  <th>Status</th>
                  <th>Erros</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(row => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.data.code ?? "—"}</td>
                    <td>{row.data.name ?? "—"}</td>
                    <td>
                      {row.product
                        ? formatMoney(row.product.unitPrice)
                        : (row.data.unitPrice ?? "—")}
                    </td>
                    <td>
                      {row.product
                        ? row.product.isActive
                          ? "Ativo"
                          : "Inativo"
                        : "—"}
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
