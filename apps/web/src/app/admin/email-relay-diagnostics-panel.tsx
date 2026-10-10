"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";

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
}: {
  accessToken: string;
}) {
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
        "Use um identificador de 8 a 96 caracteres, sem URL, e-mail ou dados pessoais."
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
        "Referência registrada para análise. Isso não representa homologação."
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

  return (
    <section
      className="activities-view"
      aria-labelledby="email-relay-diagnostics-title"
    >
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Integrações · Diagnóstico</p>
          <h2 id="email-relay-diagnostics-title">Notificações por e-mail</h2>
          <p>
            Painel de pré-validação. Não realiza envio, ativação ou testes de
            conexão com serviços externos.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => setReload(value => value + 1)}
        >
          Atualizar diagnóstico
        </button>
      </header>

      <div className="companies-view__card">
        <h3>Envio externo desativado</h3>
        <p role="status">
          Nenhuma configuração, evidência registrada ou verificação local
          habilita o envio de mensagens. É necessária homologação externa e
          aprovação operacional independente.
        </p>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? <p role="status">Consultando diagnóstico...</p> : null}

      {settings && readiness ? (
        <div className="companies-view__card">
          <h3>Configuração preparada</h3>
          <p>Modo: {settings.mode}</p>
          <p>Versão: {settings.version}</p>
          <p>Endpoint: {settings.endpoint ?? "Não configurado"}</p>
          <p>Credencial cadastrada: {settings.hasCredential ? "Sim" : "Não"}</p>
          <p>Envio permitido: Não</p>
          <h3>Verificações</h3>
          <ul>
            {checks.map(([code, label]) => (
              <li key={code}>
                <strong>{label}:</strong>{" "}
                {describeStatus(readiness.checks[code])}
              </li>
            ))}
          </ul>
          <p>
            O diagnóstico é apenas informativo; bloqueios externos não são
            resolvidos pelo registro de documentos.
          </p>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="companies-view__card">
          <h3>Evidências de homologação</h3>
          <p>
            Registre somente a referência opaca do chamado ou artefato. Não
            informe URLs, senhas, tokens, documentos ou dados pessoais. O
            registro fica auditado e permanece não verificado.
          </p>
          <form className="activity-form" onSubmit={event => void submit(event)}>
            <fieldset disabled={busy}>
              <legend>Registrar referência</legend>
              <div className="activity-form__fields">
                <label>
                  Categoria
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
                  Identificador de evidência
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
                Registrar para análise
              </button>
            </fieldset>
          </form>
          <h3>Referências registradas</h3>
          {!evidence.length ? (
            <p>Nenhuma referência registrada nesta organização.</p>
          ) : (
            <ul>
              {evidence.map(item => (
                <li key={item.id}>
                  <strong>
                    {evidenceTypes.find(([id]) => id === item.type)?.[1] ??
                      item.type}
                  </strong>
                  : <code>{item.reference}</code> — Registrada, não verificada
                  {" · "}
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
