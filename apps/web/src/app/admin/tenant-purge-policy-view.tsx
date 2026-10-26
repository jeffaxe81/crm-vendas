"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "../../i18n/language-provider";
import { apiRequest } from "../../lib/api-client";

type PurgePolicy = {
  categories: string[];
  counts: Record<string, number>;
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
  const { t, locale } = useTranslation();
  const [categories, setCategories] = useState<string[]>([
    "EXPIRED_OPERATION_PREVIEWS",
  ]);
  const [simulation, setSimulation] = useState<Record<string, number> | null>(
    null
  );
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
    setCategories(["EXPIRED_OPERATION_PREVIEWS"]);
    setSimulation(null);
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
        setCategories(result.categories ?? ["EXPIRED_OPERATION_PREVIEWS"]);
        setEnabled(result.enabled);
        setRetentionDays(result.retentionDays);
      })
      .catch(cause => {
        if (active && generationRef.current === generation)
          setError(
            cause instanceof Error
              ? cause.message
              : t("Não foi possível carregar a política de expurgo.")
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
      categories.length === 0 ||
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
          categories,
          retentionDays,
          ...(enabled ? { confirmation } : {}),
        },
      });
      if (generationRef.current !== generation) return;
      setPolicy(result);
      setCategories(result.categories ?? ["EXPIRED_OPERATION_PREVIEWS"]);
      setEnabled(result.enabled);
      setRetentionDays(result.retentionDays);
      setConfirmation("");
      setNotice(t("Política de expurgo da empresa salva com sucesso."));
    } catch (cause) {
      if (generationRef.current !== generation) return;
      setError(
        cause instanceof Error
          ? cause.message
          : t("Não foi possível salvar o expurgo.")
      );
    } finally {
      if (generationRef.current === generation) setBusy(false);
    }
  }

  async function simulate() {
    if (busy || !validRetention || categories.length === 0) return;
    const generation = generationRef.current;
    setBusy(true);
    setError("");
    setSimulation(null);
    try {
      const result = await apiRequest<{ counts: Record<string, number> }>(
        "/admin/purge/simulate",
        {
          accessToken,
          method: "POST",
          body: { retentionDays, categories },
        }
      );
      if (generationRef.current === generation) setSimulation(result.counts);
    } catch (cause) {
      if (generationRef.current === generation)
        setError(
          cause instanceof Error
            ? cause.message
            : t("Não foi possível simular o expurgo.")
        );
    } finally {
      if (generationRef.current === generation) setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-label={t("Política de expurgo por empresa")}
    >
      <h2>{t("Política de expurgo por empresa (tenant)")}</h2>
      <p>
        {t(
          "Remove somente registros técnicos antigos das categorias selecionadas. Preserva dados comerciais, usuários, backups e auditoria. Desativada por padrão."
        )}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!policy ? (
        <p>{t("Carregando configuração de expurgo...")}</p>
      ) : (
        <>
          <p>
            {t("Registros técnicos elegíveis no momento")}:{" "}
            <strong>{policy.estimatedRecords}</strong>. {t("Última execução")}:{" "}
            {policy.lastRunAt
              ? new Date(policy.lastRunAt).toLocaleString(locale)
              : t("nunca")}
            .
          </p>
          <form onSubmit={event => void save(event)}>
            <fieldset disabled={busy}>
              <legend>{t("Categorias técnicas permitidas")}</legend>
              {(
                [
                  [
                    "EXPIRED_OPERATION_PREVIEWS",
                    "Prévias expiradas sem referência de execução",
                  ],
                  [
                    "TERMINAL_WEBHOOK_DELIVERIES",
                    "Tentativas de webhooks encerrados",
                  ],
                ] as const
              ).map(([category, label]) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={categories.includes(category)}
                    onChange={event => {
                      setCategories(current =>
                        event.target.checked
                          ? [...current, category]
                          : current.filter(item => item !== category)
                      );
                      setConfirmation("");
                      setSimulation(null);
                    }}
                  />{" "}
                  {t(label)}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              disabled={busy || !validRetention || categories.length === 0}
              onClick={() => void simulate()}
            >
              {t("Simular sem excluir")}
            </button>
            {simulation ? (
              <div role="status">
                {t("Simulação: nenhuma alteração foi realizada.")}
                <p>
                  {t("Prévias expiradas sem referência de execução")}:{" "}
                  {simulation.EXPIRED_OPERATION_PREVIEWS ?? 0}
                </p>
                <p>
                  {t("Tentativas de webhooks encerrados")}:{" "}
                  {simulation.TERMINAL_WEBHOOK_DELIVERIES ?? 0}
                </p>
              </div>
            ) : null}
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
              {t("Ativar expurgo automático somente nesta empresa")}
            </label>
            <label>
              {t("Prazo de retenção dos registros técnicos")}
              <input
                type="number"
                min={30}
                max={3650}
                step={1}
                value={retentionDays}
                disabled={busy}
                onChange={event => {
                  setRetentionDays(Number(event.target.value));
                  setSimulation(null);
                  setConfirmation("");
                }}
              />
            </label>
            <p>{t("Informe um prazo de 30 a 3.650 dias para este tenant.")}</p>
            {enabled ? (
              <label>
                {t("Digite ATIVAR EXPURGO para confirmar")}
                <input
                  autoComplete="off"
                  value={confirmation}
                  disabled={busy}
                  onChange={event => setConfirmation(event.target.value)}
                />
              </label>
            ) : null}
            <p>
              {t(
                "Execução automática até uma vez a cada 24 horas, até 500 registros por categoria. Retenção desde a expiração da prévia ou encerramento do webhook. A exclusão é irreversível."
              )}
            </p>
            <button
              type="submit"
              disabled={
                busy ||
                !validRetention ||
                categories.length === 0 ||
                (enabled && confirmation !== "ATIVAR EXPURGO")
              }
            >
              {t("Salvar política de expurgo")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
