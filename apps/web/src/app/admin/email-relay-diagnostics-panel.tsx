"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";
import { EmailProviderPreferencePanel } from "./email-provider-preference-panel";
import { useTranslation } from "../../i18n/language-provider";

const checks = [
  ["relayConfigured", "Configuração da organização"],
  ["hostnameAllowlisted", "HTTPS e domínio permitido"],
  ["encryptionKeyPresent", "Chave de criptografia disponível"],
  ["credentialIntegrity", "Integridade da credencial"],
  ["providerContractCompatible", "Contrato local do adaptador"],
  ["durableProviderIdempotency", "Idempotência durável do provedor"],
  ["networkEgressPolicy", "Restrição de saída da rede"],
  ["tlsAndDnsPinning", "Validação de TLS e DNS"],
  ["externalApproval", "Homologação operacional"],
  ["senderRegistration", "Habilitação do envio"],
] as const;

const evidenceTypes = [
  ["DURABLE_IDEMPOTENCY", "Teste de idempotência"],
  ["EGRESS_POLICY", "Política de saída da rede"],
  ["TLS_DNS_POLICY", "TLS e DNS"],
  ["OPERATIONAL_REVIEW", "Revisão operacional"],
] as const;

type EvidenceType = (typeof evidenceTypes)[number][0];
type ReadinessState = "PASS" | "BLOCKED" | "NOT_VERIFIED";

type Readiness = {
  mode: "DISABLED" | "PREPARED";
  version: number;
  sendingEnabled: false;
  activationEligible: false;
  checks: Record<(typeof checks)[number][0], ReadinessState>;
  blockers: string[];
};

type RelaySettings = {
  mode: "DISABLED" | "PREPARED";
  endpoint: string | null;
  hasCredential: boolean;
  sendingEnabled: false;
  version: number;
};

type EvidenceRecord = {
  id: string;
  type: EvidenceType;
  reference: string;
  actorUserId: string | null;
  createdAt: string;
  verification: "SUBMITTED_UNVERIFIED";
  settingsVersion: number | null;
  providerVersion: number | null;
  providerCode: string | null;
  currentConfiguration: boolean;
  review?: {
    decision: "CHECKED" | "REJECTED";
    reviewerUserId: string | null;
    reviewedAt: string;
    settingsVersion: number;
    providerVersion: number | null;
    providerCode: string | null;
    currentConfiguration: boolean;
    verification: "REVIEWED_NOT_CERTIFIED";
  };
};

function describeStatus(status: ReadinessState) {
  switch (status) {
    case "PASS":
      return "Validação local aprovada";
    case "NOT_VERIFIED":
      return "Não verificado";
    case "BLOCKED":
      return "Bloqueado";
  }
}

export function EmailRelayDiagnosticsPanel({
  accessToken,
  currentUserId,
}: {
  accessToken: string;
  currentUserId: string;
}) {
  const { t } = useTranslation();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [settings, setSettings] = useState<RelaySettings | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [type, setType] = useState<EvidenceType>("DURABLE_IDEMPOTENCY");
  const [reference, setReference] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      apiRequest<Readiness>("/admin/email/relay-readiness", {
        accessToken,
      }),
      apiRequest<RelaySettings>("/admin/email/relay-settings", {
        accessToken,
      }),
      apiRequest<EvidenceRecord[]>("/admin/email/relay-evidence", {
        accessToken,
      }),
    ])
      .then(([nextReadiness, nextSettings, nextEvidence]) => {
        if (!active) return;
        setReadiness(nextReadiness);
        setSettings(nextSettings);
        setEvidence(nextEvidence);
      })
      .catch(cause => {
        if (!active) return;
        setReadiness(null);
        setSettings(null);
        setEvidence([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível consultar os diagnósticos."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    setError("");
    setNotice("");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/.test(reference)) {
      setError(
        t(
          "Use um identificador de 8 a 96 caracteres, sem URL, e-mail ou dados pessoais."
        )
      );
      return;
    }
    setBusy(true);
    try {
      await apiRequest<EvidenceRecord>("/admin/email/relay-evidence", {
        accessToken,
        method: "POST",
        body: { type, reference },
      });
      setReference("");
      setNotice(
        t(
          "Referência registrada para análise. Isso não representa homologação."
        )
      );
      setReload(value => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a evidência."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewEvidence(
    evidenceId: string,
    decision: "CHECKED" | "REJECTED"
  ) {
    if (busy || loading) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/admin/email/relay-evidence/${evidenceId}/review`, {
        accessToken,
        method: "POST",
        body: { decision },
      });
      setNotice(
        t(
          "Análise independente registrada. O relay continua sem homologação ou envio."
        )
      );
      setReload(value => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a revisão independente."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="activities-view"
      aria-labelledby="email-relay-diagnostics-title"
    >
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">
            {t("Integrações · Diagnóstico")}
          </p>
          <h2 id="email-relay-diagnostics-title">
            {t("Notificações por e-mail")}
          </h2>
          <p>
            {t(
              "Painel de pré-validação. Não realiza envio, ativação ou testes de conexão com serviços externos."
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => setReload(value => value + 1)}
        >
          {t("Atualizar diagnóstico")}
        </button>
      </header>

      <EmailProviderPreferencePanel accessToken={accessToken} />

      <div className="companies-view__card">
        <h3>{t("Envio externo desativado")}</h3>
        <p role="status">
          {t(
            "Nenhuma configuração, evidência registrada ou verificação local habilita o envio de mensagens. É necessária homologação externa e aprovação operacional independente."
          )}
        </p>
      </div>

      {error ? <p role="alert">{t(error)}</p> : null}
      {notice ? <p role="status">{t(notice)}</p> : null}
      {loading ? <p role="status">{t("Consultando diagnóstico...")}</p> : null}

      {settings && readiness ? (
        <div className="companies-view__card">
          <h3>{t("Configuração preparada")}</h3>
          <p>
            {t("Modo: ")}
            {settings.mode}
          </p>
          <p>
            {t("Versão: ")}
            {settings.version}
          </p>
          <p>
            {t("Endpoint: ")}
            {settings.endpoint ?? t("Não configurado")}
          </p>
          <p>
            {t("Credencial cadastrada: ")}
            {settings.hasCredential ? t("Sim") : t("Não")}
          </p>
          <p>{t("Envio permitido: Não")}</p>
          <h3>{t("Verificações")}</h3>
          <ul>
            {checks.map(([code, label]) => (
              <li key={code}>
                <strong>{label}:</strong>{" "}
                {describeStatus(readiness.checks[code])}
              </li>
            ))}
          </ul>
          <p>
            {t(
              "O diagnóstico é apenas informativo; bloqueios externos não são resolvidos pelo registro de documentos."
            )}
          </p>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="companies-view__card">
          <h3>{t("Evidências de homologação")}</h3>
          <p>
            {t(
              "Registre somente a referência opaca do chamado ou artefato. Não informe URLs, senhas, tokens, documentos ou dados pessoais. O registro fica auditado e permanece não verificado. Outro administrador poderá analisar ou rejeitar a referência; nenhuma das opções certifica o provedor ou libera o envio. Trocar o provedor invalida evidências de versões anteriores."
            )}
          </p>
          <form
            className="activity-form"
            onSubmit={event => void submit(event)}
          >
            <fieldset disabled={busy}>
              <legend>{t("Registrar referência")}</legend>
              <div className="activity-form__fields">
                <label>
                  {t("Categoria")}
                  <select
                    value={type}
                    onChange={event =>
                      setType(event.target.value as EvidenceType)
                    }
                  >
                    {evidenceTypes.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Identificador de evidência")}
                  <input
                    value={reference}
                    onChange={event => setReference(event.target.value)}
                    minLength={8}
                    maxLength={96}
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]{7,95}"
                    placeholder="TICKET-2026-0001"
                    autoComplete="off"
                    required
                  />
                </label>
              </div>
              <button type="submit" disabled={busy}>
                {t("Registrar para análise")}
              </button>
            </fieldset>
          </form>
          <h3>{t("Referências registradas")}</h3>
          {!evidence.length ? (
            <p>{t("Nenhuma referência registrada nesta organização.")}</p>
          ) : (
            <ul>
              {evidence.map(item => (
                <li key={item.id}>
                  <strong>
                    {evidenceTypes.find(([id]) => id === item.type)?.[1] ??
                      item.type}
                  </strong>
                  : <code>{item.reference}</code>
                  {t(" — Registrada, não verificada")}
                  {" · "}
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                  {" · "}
                  {t("Relay v")}
                  {item.settingsVersion ?? "legada"}
                  {" · "}
                  {t("Provedor ")}
                  {item.providerCode ?? "legado"}
                  {t(" v")}
                  {item.providerVersion ?? "legada"}
                  {!item.currentConfiguration
                    ? t(" · Evidência desatualizada — registre nova referência")
                    : ""}
                  {item.review ? (
                    <p>
                      {t("Revisão independente:")}{" "}
                      {item.review.decision === "CHECKED"
                        ? t("Analisada, não certificada")
                        : t("Rejeitada")}
                      {" · "}
                      {new Date(item.review.reviewedAt).toLocaleString("pt-BR")}
                      {!item.review.currentConfiguration
                        ? t(
                            " · Provedor ou configuração alterados após a revisão"
                          )
                        : ""}
                    </p>
                  ) : item.actorUserId !== currentUserId &&
                    item.currentConfiguration ? (
                    <div className="support-queues__actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reviewEvidence(item.id, "CHECKED")}
                      >
                        {t("Registrar análise independente")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reviewEvidence(item.id, "REJECTED")}
                      >
                        {t("Rejeitar referência")}
                      </button>
                    </div>
                  ) : (
                    <p>
                      {t(
                        "Revisão requer outro administrador e a versão atual."
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
