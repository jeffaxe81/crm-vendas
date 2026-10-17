"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";

type PurgePolicy = {
  enabled: boolean;
  retentionDays: number;
  lastRunAt: string | null;
  estimatedRecords: number;
  target: "EXPIRED_OPERATION_PREVIEWS";
  cutoff: string;
};

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
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let active = true;
    setPolicy(null);
    setEnabled(false);
    setRetentionDays(180);
    setConfirmation("");
    setError("");
    setNotice("");
    setBusy(false);
    void apiRequest<PurgePolicy>("/admin/purge/policy", { accessToken })
      .then(result => {
        if (!active || generationRef.current !== generation) return;
        setPolicy(result);
        setEnabled(result.enabled);
        setRetentionDays(result.retentionDays);
      })
      .catch(cause => {
        if (active && generationRef.current === generation)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar a política de expurgo."
          );
      });
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current++;
    };
  }, [accessToken]);

  const validRetention =
    Number.isInteger(retentionDays) &&
    retentionDays >= 30 &&
    retentionDays <= 3650;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !policy ||
      busy ||
      !validRetention ||
      (enabled && confirmation !== "ATIVAR EXPURGO")
    )
      return;
    const generation = generationRef.current;
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
      if (generationRef.current !== generation) return;
      setPolicy(result);
      setEnabled(result.enabled);
      setRetentionDays(result.retentionDays);
      setConfirmation("");
      setNotice("Política de expurgo da empresa salva com sucesso.");
    } catch (cause) {
      if (generationRef.current !== generation) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o expurgo."
      );
    } finally {
      if (generationRef.current === generation) setBusy(false);
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
              : "nunca"}
            .
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
              <input
                type="number"
                min={30}
                max={3650}
                step={1}
                value={retentionDays}
                disabled={busy}
                onChange={event => setRetentionDays(Number(event.target.value))}
              />
            </label>
            <p>Informe um prazo de 30 a 3.650 dias para este tenant.</p>
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
              A execução é automática, até uma vez a cada 24 horas, em lotes de
              até 500 registros por tenant. A retenção é contada a partir da
              expiração da prévia. O expurgo efetivo é irreversível.
            </p>
            <button
              type="submit"
              disabled={
                busy ||
                !validRetention ||
                (enabled && confirmation !== "ATIVAR EXPURGO")
              }
            >
              Salvar política de expurgo
            </button>
          </form>
        </>
      )}
    </section>
  );
}
