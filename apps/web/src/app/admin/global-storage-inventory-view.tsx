"use client";

import {
  StorageGlobalInventorySchema,
  type StorageGlobalInventory,
  type StorageInventoryFindingStatus,
} from "@axes/contracts";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/language-provider";
import { apiRequest } from "../../lib/api-client";

const PAGE_SIZE = 20;

// Remount before rendering a different session, rather than clearing private
// results in an effect after the previous session's data has already rendered.
export function GlobalStorageInventoryView({
  accessToken,
}: {
  accessToken: string;
}) {
  return <InventoryPanel key={accessToken} accessToken={accessToken} />;
}

function InventoryPanel({ accessToken }: { accessToken: string }) {
  const { t, locale } = useTranslation();
  const [report, setReport] = useState<StorageGlobalInventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StorageInventoryFindingStatus | "ALL">(
    "ALL"
  );
  const [findingPage, setFindingPage] = useState(0);
  const [tenantPage, setTenantPage] = useState(0);
  const alive = useRef(true);
  const pending = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function scan() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setReport(null);
    setError("");
    setFindingPage(0);
    setTenantPage(0);
    setStatus("ALL");
    try {
      const payload = await apiRequest<unknown>("/admin/storage/inventory", {
        accessToken,
        cache: "no-store",
      });
      if (!alive.current) return;
      const parsed = StorageGlobalInventorySchema.safeParse(payload);
      if (!parsed.success) {
        setError(t("O inventário retornou dados inválidos."));
        return;
      }
      setReport(parsed.data);
    } catch {
      if (alive.current)
        setError(t("Não foi possível consultar o inventário."));
    } finally {
      if (alive.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }

  const names: Record<StorageInventoryFindingStatus, string> = {
    ORPHAN: t("Objeto sem registro no catálogo"),
    MISSING: t("Arquivo ausente"),
    SIZE_MISMATCH: t("Tamanho divergente"),
    UNREADABLE: t("Arquivo inacessível"),
    STATE_INCONSISTENCY: t("Registro excluído com objeto físico"),
  };
  const filtered =
    report?.findings.filter(
      finding => status === "ALL" || finding.status === status
    ) ?? [];
  const findings = filtered.slice(
    findingPage * PAGE_SIZE,
    (findingPage + 1) * PAGE_SIZE
  );
  const tenants =
    report?.tenants.slice(
      tenantPage * PAGE_SIZE,
      (tenantPage + 1) * PAGE_SIZE
    ) ?? [];
  const findingPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const tenantPages = Math.max(
    1,
    Math.ceil((report?.tenants.length ?? 0) / PAGE_SIZE)
  );
  const formatBytes = (value: string | null) =>
    value === null ? t("Desconhecido") : BigInt(value).toLocaleString(locale);

  return (
    <section
      className="companies-view__card"
      aria-label={t("Inventário global de backups")}
      aria-busy={busy}
    >
      <h2>{t("Inventário global de backups")}</h2>
      <p>
        {t(
          "Consulta manual de todas as empresas, disponível somente ao Superusuário. Não altera nem exclui arquivos."
        )}
      </p>
      <button type="button" disabled={busy} onClick={() => void scan()}>
        {busy
          ? t("Consultando inventário...")
          : t("Consultar inventário global")}
      </button>
      {busy ? <p role="status">{t("Consultando inventário...")}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        !report.configured ? (
          <p role="status">
            {t(
              "O armazenamento de backups não está configurado neste servidor."
            )}
          </p>
        ) : (
          <>
            <p role="status">
              {report.complete
                ? t("Varredura concluída.")
                : t("Resultado parcial.")}
            </p>
            <dl>
              <dt>{t("Registros no catálogo")}</dt>
              <dd>{report.catalogCount.toLocaleString(locale)}</dd>
              <dt>{t("Objetos físicos observados")}</dt>
              <dd>{report.physicalObjectCount.toLocaleString(locale)}</dd>
              <dt>{t("Bytes físicos conhecidos")}</dt>
              <dd>{formatBytes(report.physicalBytes)}</dd>
              <dt>{t("Objetos sem registro")}</dt>
              <dd>{report.orphanCount.toLocaleString(locale)}</dd>
              <dt>{t("Arquivos ausentes")}</dt>
              <dd>{report.missingCount.toLocaleString(locale)}</dd>
              <dt>{t("Tamanhos divergentes")}</dt>
              <dd>{report.sizeMismatchCount.toLocaleString(locale)}</dd>
              <dt>{t("Arquivos inacessíveis")}</dt>
              <dd>{report.unreadableCount.toLocaleString(locale)}</dd>
              <dt>{t("Registros excluídos com objeto físico")}</dt>
              <dd>{report.stateInconsistencyCount.toLocaleString(locale)}</dd>
              <dt>{t("Entradas temporárias")}</dt>
              <dd>{report.temporaryCount.toLocaleString(locale)}</dd>
              <dt>{t("Entradas inesperadas")}</dt>
              <dd>{report.unexpectedCount.toLocaleString(locale)}</dd>
            </dl>
            <h3>{t("Consumo conhecido por empresa")}</h3>
            {tenants.length ? (
              <>
                <div className="sales-report__table">
                  <table aria-label={t("Consumo conhecido por empresa")}>
                    <thead>
                      <tr>
                        <th scope="col">{t("Empresa (ID)")}</th>
                        <th scope="col">{t("Registros no catálogo")}</th>
                        <th scope="col">{t("Objetos físicos observados")}</th>
                        <th scope="col">{t("Bytes físicos conhecidos")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map(tenant => (
                        <tr key={tenant.organizationId}>
                          <td>{tenant.organizationId}</td>
                          <td>{tenant.catalogCount.toLocaleString(locale)}</td>
                          <td>
                            {tenant.physicalObjectCount.toLocaleString(locale)}
                          </td>
                          <td>{formatBytes(tenant.physicalBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={tenantPage === 0}
                    onClick={() => setTenantPage(page => page - 1)}
                  >
                    {t("Página anterior de empresas")}
                  </button>
                  <span>
                    {t("Página {page} de {pages}", {
                      page: tenantPage + 1,
                      pages: tenantPages,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={tenantPage + 1 >= tenantPages}
                    onClick={() => setTenantPage(page => page + 1)}
                  >
                    {t("Próxima página de empresas")}
                  </button>
                </div>
              </>
            ) : (
              <p>{t("Nenhuma empresa no catálogo.")}</p>
            )}
            <h3>{t("Ocorrências do inventário")}</h3>
            <label>
              {t("Filtrar ocorrências")}
              <select
                value={status}
                onChange={event => {
                  setStatus(
                    event.target.value as StorageInventoryFindingStatus | "ALL"
                  );
                  setFindingPage(0);
                }}
              >
                <option value="ALL">{t("Todas as ocorrências")}</option>
                {Object.entries(names).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {findings.length ? (
              <>
                <div className="sales-report__table">
                  <table aria-label={t("Ocorrências do inventário")}>
                    <thead>
                      <tr>
                        <th scope="col">{t("Ocorrência")}</th>
                        <th scope="col">{t("Backup (ID)")}</th>
                        <th scope="col">{t("Empresa (ID)")}</th>
                        <th scope="col">{t("Bytes físicos conhecidos")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map(finding => (
                        <tr key={`${finding.backupId}:${finding.status}`}>
                          <td>{names[finding.status]}</td>
                          <td>{finding.backupId}</td>
                          <td>
                            {finding.organizationId ??
                              t("Sem referência no catálogo")}
                          </td>
                          <td>{formatBytes(finding.filesystemBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={findingPage === 0}
                    onClick={() => setFindingPage(page => page - 1)}
                  >
                    {t("Página anterior de ocorrências")}
                  </button>
                  <span>
                    {t("Página {page} de {pages}", {
                      page: findingPage + 1,
                      pages: findingPages,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={findingPage + 1 >= findingPages}
                    onClick={() => setFindingPage(page => page + 1)}
                  >
                    {t("Próxima página de ocorrências")}
                  </button>
                </div>
              </>
            ) : (
              <p>
                {report.findings.length === 0 && report.complete
                  ? t("Nenhuma inconsistência encontrada nesta consulta.")
                  : t("Nenhuma ocorrência para este filtro.")}
              </p>
            )}
            <p>
              {t(
                "Os bytes não incluem tamanhos desconhecidos. Alterações durante a consulta podem afetar o resultado; esta verificação não comprova integridade nem restaurabilidade."
              )}
            </p>
          </>
        )
      ) : null}
    </section>
  );
}
