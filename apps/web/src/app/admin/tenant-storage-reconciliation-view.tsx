"use client";

import { useEffect, useRef, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type Finding = {
  backupId: string;
  status: "MISSING" | "SIZE_MISMATCH" | "UNREADABLE";
  catalogBytes: string;
  filesystemBytes: string | null;
};

type Report = {
  configured: boolean;
  scope: "COMPLETED_TENANT_BACKUPS";
  metadataOnly: true;
  scanLimit: number;
  catalogCount: number;
  checkedCount: number;
  complete: boolean;
  matchingCount: number;
  missingCount: number;
  sizeMismatchCount: number;
  unreadableCount: number;
  scannedFilesystemBytes: string;
  findings: Finding[];
};

const statusNames: Record<Finding["status"], string> = {
  MISSING: "Arquivo ausente",
  SIZE_MISMATCH: "Tamanho divergente",
  UNREADABLE: "Arquivo inacessível",
};

export function TenantStorageReconciliationView({
  accessToken,
}: {
  accessToken: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generationRef = useRef(0);

  useEffect(() => {
    ++generationRef.current;
    setReport(null);
    setBusy(false);
    setError("");
    return () => {
      ++generationRef.current;
    };
  }, [accessToken]);

  async function scan() {
    if (busy) return;
    const generation = generationRef.current;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const response = await apiRequest<Report>("/admin/storage/reconciliation", {
        accessToken,
      });
      if (generationRef.current === generation) setReport(response);
    } catch (cause) {
      if (generationRef.current === generation)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível verificar os arquivos de backup."
        );
    } finally {
      if (generationRef.current === generation) setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-label="Conferência dos arquivos de backup"
    >
      <h2>Conferência dos arquivos de backup</h2>
      <p>
        Verificação manual e somente leitura de até 50 backups concluídos
        desta empresa. Compara tamanho físico e catálogo, sem examinar
        conteúdo ou excluir arquivos.
      </p>
      <button type="button" onClick={() => void scan()} disabled={busy}>
        {busy ? "Verificando..." : "Conferir arquivos desta empresa"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        !report.configured ? (
          <p role="status">
            O armazenamento de backups não está configurado neste servidor.
            Nenhum arquivo foi verificado.
          </p>
        ) : (
          <div role="status">
            <p>
              Arquivos conferidos: <strong>{report.checkedCount}</strong> de{" "}
              <strong>{report.catalogCount}</strong> backups concluídos.
              Correspondências: <strong>{report.matchingCount}</strong>.
              Ausentes: <strong>{report.missingCount}</strong>.
              Tamanhos divergentes:{" "}
              <strong>{report.sizeMismatchCount}</strong>.
              Inacessíveis: <strong>{report.unreadableCount}</strong>.
            </p>
            {!report.complete ? (
              <p>
                Amostra parcial: existem mais arquivos no catálogo. Esta
                conferência não verifica objetos órfãos.
              </p>
            ) : null}
            {report.findings.length > 0 ? (
              <ul>
                {report.findings.map(finding => (
                  <li key={finding.backupId}>
                    {statusNames[finding.status]} — ID {finding.backupId}
                  </li>
                ))}
              </ul>
            ) : null}
            <p>
              Esta comparação de metadados não confirma integridade
              criptográfica nem disponibilidade de restauração.
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
