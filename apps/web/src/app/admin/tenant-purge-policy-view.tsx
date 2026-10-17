"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";

type PurgePolicy = {
  enabled: boolean;
  retentionDays: number;
  lastRunAt: string | null;
  estimatedRecords: number;
  target: "EXPIRED_OPERATION_PREVIEWS";
  cutoff: string;
};

const days = [30, 90, 180, 365, 730, 1095, 3650];

export function TenantPurgePolicyView({
  accessToken,
}: {
  accessToken: string;
}) {
  const [policy, setPolicy] = useState<PurgePolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState(180);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setPolicy(null);
    setEnabled(false);
    setRetentionDays(180);
    setConfirmation("");
    setError("");
    setNotice("");
    void apiRequest<PurgePolicy>("/admin/purge/policy", { accessToken })
      .then(result => {
        if (!active) return;
        setPolicy(result);
        setEnabled(result.enabled);
        setRetentionDays(result.retentionDays);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar a política de expurgo."
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy || busy || (enabled && confirmation !== "ATIVAR EXPURGO"))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<PurgePolicy>("/admin/purge/policy", {
        accessToken,
        method: "PUT",
        body: {
          enabled,
          retentionDays,
          ...(enabled ? { confirmation } : {}),
        },
      });
      setPolicy(result);
      setEnabled(result.enabled);
      setRetentionDays(result.retentionDays);
      setConfirmation("");
      setNotice("Política de expurgo da empresa salva com sucesso.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o expurgo."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-label="Política de expurgo por empresa"
    >
      <h2>Política de expurgo por empresa (tenant)</h2>
      <p>
        Remove apenas prévias de operações já expiradas e antigas. Preserva
        cadastros, contatos, negócios, tickets, backups, históricos de webhooks
        e logs de auditoria. Desativada por padrão.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!policy ? (
        <p>Carregando configuração de expurgo...</p>
      ) : (
        <>
          <p>
            Registros técnicos elegíveis no momento:{" "}
            <strong>{policy.estimatedRecords}</strong>. Última execução:{" "}
            {policy.lastRunAt
              ? new Date(policy.lastRunAt).toLocaleString("pt-BR")
              : "nunca"}.
          </p>
          <form onSubmit={event => void save(event)}>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={event => {
                  setEnabled(event.target.checked);
                  setConfirmation("");
                }}
              />{" "}
              Ativar expurgo automático somente nesta empresa
            </label>
            <label>
              Prazo de retenção dos registros técnicos
              <select
                value={retentionDays}
                disabled={busy}
                onChange={event => setRetentionDays(Number(event.target.value))}
              >
                {days.map(value => (
                  <option value={value} key={value}>
                    {value} dias
                  </option>
                ))}
              </select>
            </label>
            {enabled ? (
              <label>
                Digite ATIVAR EXPURGO para confirmar
                <input
                  autoComplete="off"
                  value={confirmation}
                  disabled={busy}
                  onChange={event => setConfirmation(event.target.value)}
                />
              </label>
            ) : null}
            <p>
              A execução é automática, até uma vez a cada 24 horas, em lotes
              de até 500 registros por tenant. A retenção é contada a partir
              da expiração da prévia. O expurgo efetivo é irreversível.
            </p>
            <button
              type="submit"
              disabled={busy || (enabled && confirmation !== "ATIVAR EXPURGO")}
            >
              Salvar política de expurgo
            </button>
          </form>
        </>
      )}
    </section>
  );
}
