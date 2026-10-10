"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  IntegrationCredentialCreatedSchema,
  IntegrationCredentialSummarySchema,
  type IntegrationCredentialCreated,
  type IntegrationCredentialSummary,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
import { NeoCommunicationSettingsView } from "./neo-communication-settings-view";
import { WebhookSubscriptionsView } from "./webhook-subscriptions-view";

// Escopos dos domínios publicados na fundação F4.1. Administração e
// Superusuário não são delegados por esta tela.
const publicScopes = [
  { id: "company.read", label: "Consultar empresas" },
  { id: "company.write", label: "Alterar empresas" },
  { id: "contact.read", label: "Consultar contatos" },
  { id: "contact.write", label: "Alterar contatos" },
  { id: "opportunity.read", label: "Consultar oportunidades" },
  { id: "opportunity.write", label: "Alterar oportunidades" },
  { id: "opportunity.move", label: "Mover oportunidades no funil" },
] as const;

function formatDate(value: string | null, empty: string) {
  return value ? new Date(value).toLocaleString("pt-BR") : empty;
}

function credentialStatus(credential: IntegrationCredentialSummary) {
  if (credential.revokedAt || !credential.isActive) return "Revogada";
  if (
    credential.expiresAt &&
    new Date(credential.expiresAt).getTime() <= Date.now()
  )
    return "Expirada";
  return "Ativa";
}

export function IntegrationCredentialsView({
  accessToken,
  permissions,
}: {
  accessToken: string;
  permissions: readonly string[];
}) {
  const canRead = permissions.includes("integration.read");
  const canManage = permissions.includes("integration.manage");
  const allowedScopes = publicScopes.filter(scope =>
    permissions.includes(scope.id)
  );
  const [credentials, setCredentials] = useState<
    IntegrationCredentialSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [created, setCreated] = useState<IntegrationCredentialCreated | null>(
    null
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setLoading(true);
    setListError("");
    void apiRequest<unknown>("/integrations/credentials", { accessToken })
      .then(payload => {
        const parsed =
          IntegrationCredentialSummarySchema.array().parse(payload);
        if (active) setCredentials(parsed);
      })
      .catch(cause => {
        if (active)
          setListError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as chaves."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, canRead, reload]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || created) return;
    setError("");
    setNotice("");
    if (!name.trim()) {
      setError("Informe o nome da integração.");
      return;
    }
    const selectedScopes = allowedScopes
      .filter(scope => scopes.includes(scope.id))
      .map(scope => scope.id);
    if (!selectedScopes.length) {
      setError("Selecione ao menos uma permissão.");
      return;
    }
    const expiration = expiresAt ? new Date(expiresAt) : null;
    if (
      expiration &&
      (!Number.isFinite(expiration.getTime()) ||
        expiration.getTime() <= Date.now())
    ) {
      setError("Informe uma data de expiração futura.");
      return;
    }
    setBusy(true);
    try {
      const payload = await apiRequest<unknown>("/integrations/credentials", {
        accessToken,
        method: "POST",
        body: {
          name: name.trim(),
          scopes: selectedScopes,
          ...(expiration ? { expiresAt: expiration.toISOString() } : {}),
        },
      });
      const result = IntegrationCredentialCreatedSchema.parse(payload);
      setCreated(result);
      const summary = IntegrationCredentialSummarySchema.parse(result);
      setCredentials(current => [
        summary,
        ...current.filter(item => item.id !== summary.id),
      ]);
      setName("");
      setScopes([]);
      setExpiresAt("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a chave."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    setError("");
    try {
      await navigator.clipboard.writeText(created.plainKey);
      setNotice("Chave copiada.");
    } catch {
      setError(
        "Não foi possível copiar. Selecione a chave e copie manualmente."
      );
    }
  }

  async function revoke(credential: IntegrationCredentialSummary) {
    if (!canManage || busy || confirmingId !== credential.id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/integrations/credentials/${credential.id}`, {
        accessToken,
        method: "DELETE",
      });
      setCredentials(current =>
        current.map(item =>
          item.id === credential.id
            ? { ...item, isActive: false, revokedAt: new Date().toISOString() }
            : item
        )
      );
      if (created?.id === credential.id) setCreated(null);
      setConfirmingId(null);
      setNotice(`Chave de ${credential.name} revogada.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível revogar a chave."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return null;
  return (
    <section
      className="activities-view integration-credentials"
      aria-labelledby="integration-credentials-title"
    >
      <WebhookSubscriptionsView
        accessToken={accessToken}
        canManage={canManage}
      />
      <NeoCommunicationSettingsView
        accessToken={accessToken}
        canManage={canManage}
      />
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Integrações</p>
          <h1 id="integration-credentials-title">Chaves de integração</h1>
          <p>
            Gerencie o acesso de sistemas externos aos dados desta organização.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => setReload(value => value + 1)}
        >
          Atualizar lista
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {created ? (
        <div
          className="companies-view__card integration-credentials__secret"
          role="region"
          aria-label="Nova chave de integração"
        >
          <h2>Chave criada para {created.name}</h2>
          <p>
            Guarde esta chave em um local seguro. Ela aparece somente agora e
            não poderá ser consultada novamente.
          </p>
          <output aria-label="Chave de API">{created.plainKey}</output>
          <div className="support-queues__actions">
            <button type="button" onClick={() => void copyKey()}>
              Copiar chave
            </button>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setError("");
                setNotice("");
              }}
            >
              Já guardei a chave
            </button>
          </div>
        </div>
      ) : canManage ? (
        <form
          className="activity-form"
          aria-label="Criar chave de integração"
          onSubmit={event => void create(event)}
        >
          <fieldset disabled={busy || loading || Boolean(listError)}>
            <legend>Nova chave</legend>
            <div className="activity-form__fields">
              <label>
                Nome da integração
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  maxLength={160}
                  autoComplete="off"
                />
              </label>
              <div>
                <label>
                  Expiração (opcional)
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    aria-describedby="integration-expiry-help"
                    onChange={event => setExpiresAt(event.target.value)}
                  />
                </label>
                <small id="integration-expiry-help">
                  Horário local deste navegador. Vazio: sem expiração
                  automática.
                </small>
              </div>
            </div>
            <fieldset className="integration-credentials__scopes">
              <legend>Permissões da chave</legend>
              <p>Selecione apenas os acessos necessários à integração.</p>
              {allowedScopes.map(scope => (
                <label key={scope.id} className="workspace-checkbox">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.id)}
                    onChange={event =>
                      setScopes(current =>
                        event.target.checked
                          ? [...current, scope.id]
                          : current.filter(id => id !== scope.id)
                      )
                    }
                  />
                  {scope.label}
                </label>
              ))}
              {!allowedScopes.length ? (
                <p>
                  Seu perfil não possui permissões delegáveis para a API
                  pública.
                </p>
              ) : null}
            </fieldset>
            <button
              className="button"
              type="submit"
              disabled={!allowedScopes.length}
            >
              Criar chave
            </button>
          </fieldset>
        </form>
      ) : null}
      {listError ? (
        <p role="alert">
          {listError}
          <button
            type="button"
            disabled={busy}
            onClick={() => setReload(value => value + 1)}
          >
            Tentar novamente
          </button>
        </p>
      ) : loading ? (
        <p role="status">Carregando chaves...</p>
      ) : (
        <div className="integration-credentials__list">
          {!credentials.length ? (
            <p>Nenhuma chave cadastrada.</p>
          ) : (
            credentials.map(credential => (
              <article
                key={credential.id}
                className="companies-view__card"
                aria-label={`Chave ${credential.name}`}
              >
                <h2>{credential.name}</h2>
                <p>
                  <span>{credentialStatus(credential)}</span> ·{" "}
                  <code>{credential.keyPrefix}</code>
                </p>
                <p>
                  Permissões:{" "}
                  {credential.scopes
                    .map(
                      id =>
                        publicScopes.find(scope => scope.id === id)?.label ?? id
                    )
                    .join(", ")}
                </p>
                <p>
                  Último uso:{" "}
                  {formatDate(credential.lastUsedAt, "Ainda não utilizada")}
                </p>
                <p>
                  Expiração: {formatDate(credential.expiresAt, "Sem expiração")}
                </p>
                {canManage && credential.isActive && !credential.revokedAt ? (
                  confirmingId === credential.id ? (
                    <div
                      role="group"
                      aria-label={`Confirmar revogação de ${credential.name}`}
                    >
                      <p>
                        Revogar {credential.name}? As aplicações que usam esta
                        chave perderão acesso.
                      </p>
                      <div className="support-queues__actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void revoke(credential)}
                        >
                          Confirmar revogação
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancelar revogação
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Revogar ${credential.name}`}
                      onClick={() => {
                        setError("");
                        setConfirmingId(credential.id);
                      }}
                    >
                      Revogar
                    </button>
                  )
                ) : null}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
