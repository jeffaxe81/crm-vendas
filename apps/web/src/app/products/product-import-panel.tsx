"use client";

import type {
  ProductImportPreview,
  ProductImportResult,
} from "@axes/contracts";
import { type ChangeEvent, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { formatMoney } from "../opportunities/opportunity-items-panel";
import { useTranslation } from "../../i18n/language-provider";

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
  const { t } = useTranslation();
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
    <section
      className="company-import"
      aria-label={t("Importar produtos por CSV")}
    >
      <div className="company-form__heading">
        <div>
          <p>{t("Importação")}</p>
          <h2>{t("Importar produtos por CSV")}</h2>
        </div>
        <button type="button" onClick={onClose}>
          {t("Fechar")}
        </button>
      </div>

      <p>
        {t("Colunas aceitas: ")}
        <code>{t("code")}</code>, <code>{t("name")}</code>
        {t(" e")} <code>{t("unitPrice")}</code>
        {t(" (obrigatórias), ")}
        <code>{t("description")}</code>
        {t(" e")} <code>{t("isActive")}</code>
        {t(
          " (true/false, sim/não ou 1/0; padrão ativo). Preço com ponto ou vírgula decimal. Até 500 linhas; códigos já cadastrados são rejeitados."
        )}
      </p>

      <label>
        <span>{t("Arquivo CSV")}</span>
        <input
          aria-label={t("Arquivo CSV de produtos")}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={event => void previewImport(event)}
        />
      </label>

      {error ? (
        <p className="companies-view__error" role="alert">
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
            aria-label={t("Tabela: Prévia de produtos")}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>{t("Linha")}</th>
                  <th>{t("Código")}</th>
                  <th>{t("Nome")}</th>
                  <th>{t("Preço")}</th>
                  <th>{t("Situação")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Erros")}</th>
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
                          ? t("Ativo")
                          : t("Inativo")
                        : "—"}
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
  );
}
