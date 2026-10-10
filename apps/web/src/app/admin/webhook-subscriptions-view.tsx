"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  WebhookDispatchSummarySchema,
  WebhookSubscriptionCreatedSchema,
  WebhookSubscriptionSummarySchema,
  type WebhookDispatchSummary,
  type WebhookEventType,
  type WebhookSubscriptionSummary,
} from "@axes/contracts";
import { ApiError, apiRequest } from "../../lib/api-client";

const events: Array<{ value: WebhookEventType; label: string }> = [
  { value: "company.created", label: "Empresa criada" },
  { value: "opportunity.won", label: "Oportunidade ganha" },
  { value: "opportunity.lost", label: "Oportunidade perdida" },
  { value: "ticket.closed", label: "Chamado encerrado" },
];

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function WebhookSubscriptionsView({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  // Remove inclusive secrets and pending editor state on every tenant/session change.
  return (
    <TenantWebhooks
      key={accessToken}
      accessToken={accessToken}
      canManage={canManage}
    />
  );
}

function TenantWebhooks({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<WebhookSubscriptionSummary[]>([]);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTargetUrl, setEditTargetUrl] = useState("");
  const [editEvents, setEditEvents] = useState<WebhookEventType[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<WebhookDispatchSummary[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<unknown>("/integrations/webhooks", { accessToken })
      .then(payload => {
        const parsed = WebhookSubscriptionSummarySchema.array().parse(payload);
        if (active) setItems(parsed);
      })
      .catch(cause => {
        if (active) setError(message(cause, "Falha ao listar webhooks."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, reload]);

  useEffect(() => {
    if (!historyId) {
      setHistory(null);
      setHistoryError("");
      return;
    }
    let active = true;
    setHistory(null);
    setHistoryError("");
    setHistoryLoading(true);
    void apiRequest<unknown>(`/integrations/webhooks/${historyId}/deliveries`, {
      accessToken,
    })
      .then(payload => {
        const parsed = WebhookDispatchSummarySchema.array().parse(payload);
        if (active) setHistory(parsed);
      })
      .catch(cause => {
        if (active)
          setHistoryError(message(cause, "Falha ao consultar entregas."));
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, historyId, reload]);

  function beginEdit(item: WebhookSubscriptionSummary) {
    setError("");
    setNotice("");
    setConfirmId(null);
    setEditingId(item.id);
    setEditName(item.name);
    setEditTargetUrl(item.targetUrl);
    setEditEvents([...item.eventTypes]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || secret || !eventTypes.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<unknown>("/integrations/webhooks", {
        accessToken,
        method: "POST",
        body: { name: name.trim(), targetUrl, eventTypes },
      });
      const { plainSecret, ...summary } =
        WebhookSubscriptionCreatedSchema.parse(payload);
      // The one-time signing secret is intentionally absent from list state.
      setItems(current => [summary, ...current]);
      setSecret(plainSecret);
      setName("");
      setTargetUrl("");
      setEventTypes([]);
      setNotice("Webhook criado. Guarde o segredo de assinatura.");
    } catch (cause) {
      setError(message(cause, "Falha ao criar webhook."));
    } finally {
      setBusy(false);
    }
  }

  async function update(
    item: WebhookSubscriptionSummary,
    change: {
      name?: string;
      targetUrl?: string;
      eventTypes?: WebhookEventType[];
      isActive?: boolean;
    }
  ) {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<unknown>(
        `/integrations/webhooks/${item.id}`,
        {
          accessToken,
          method: "PATCH",
          body: { version: item.version, ...change },
        }
      );
      const parsed = WebhookSubscriptionSummarySchema.parse(payload);
      setItems(current =>
        current.map(existing => (existing.id === item.id ? parsed : existing))
      );
      setEditingId(null);
      setConfirmId(null);
      setHistoryId(null);
      setNotice("Webhook atualizado.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setEditingId(null);
        setConfirmId(null);
        setReload(current => current + 1);
        setError(
          "Webhook alterado por outra sessão. Lista atualizada; revise e tente novamente."
        );
      } else {
        setError(message(cause, "Falha ao atualizar webhook."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestTest(item: WebhookSubscriptionSummary) {
    if (!canManage || busy || !item.isActive) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = await apiRequest<unknown>(
        `/integrations/webhooks/${item.id}/test`,
        { accessToken, method: "POST", body: {} }
      );
      WebhookDispatchSummarySchema.parse(payload);
      setNotice(
        "Teste enfileirado. Consulte o histórico para conferir a entrega."
      );
      setHistoryId(null);
    } catch (cause) {
      setError(message(cause, "Falha ao solicitar teste."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="companies-view__card" aria-labelledby="webhooks-title">
      <h2 id="webhooks-title">Webhooks de saída</h2>
      <p>
        Notificações HTTPS assinadas para sistemas externos desta organização.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {secret ? (
        <div role="region" aria-label="Segredo do webhook criado">
          <p>Guarde este segredo agora. Ele não será exibido novamente.</p>
          <output aria-label="Segredo de assinatura">{secret}</output>
          <button type="button" onClick={() => setSecret("")}>
            Já guardei o segredo
          </button>
        </div>
      ) : canManage ? (
        <form onSubmit={event => void create(event)}>
          <fieldset disabled={busy || loading}>
            <legend>Novo webhook</legend>
            <label>
              Nome
              <input
                required
                maxLength={160}
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </label>
            <label>
              Destino HTTPS
              <input
                required
                type="url"
                maxLength={2048}
                value={targetUrl}
                placeholder="https://exemplo.com/webhook"
                onChange={event => setTargetUrl(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Eventos</legend>
              {events.map(option => (
                <label key={option.value} className="workspace-checkbox">
                  <input
                    type="checkbox"
                    checked={eventTypes.includes(option.value)}
                    onChange={event =>
                      setEventTypes(current =>
                        event.target.checked
                          ? [...current, option.value]
                          : current.filter(value => value !== option.value)
                      )
                    }
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <button type="submit" disabled={busy || eventTypes.length === 0}>
              Criar webhook
            </button>
          </fieldset>
        </form>
      ) : null}

      <button
        type="button"
        disabled={busy || loading}
        onClick={() => setReload(value => value + 1)}
      >
        Atualizar webhooks
      </button>
      {loading ? <p role="status">Carregando webhooks...</p> : null}
      {!loading && items.length === 0 ? (
        <p>Nenhum webhook cadastrado.</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              <strong>{item.name}</strong> —{" "}
              {item.isActive ? "Ativo" : "Inativo"}
              <p>{item.targetUrl}</p>
              <p>{item.eventTypes.join(", ")}</p>
              {canManage && !secret ? (
                <div className="support-queues__actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => beginEdit(item)}
                    aria-label={`Editar webhook ${item.name}`}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null);
                      setConfirmId(item.id);
                    }}
                    aria-label={`${item.isActive ? "Desativar" : "Ativar"} webhook ${item.name}`}
                  >
                    {item.isActive ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !item.isActive}
                    onClick={() => void requestTest(item)}
                    aria-label={`Testar webhook ${item.name}`}
                  >
                    Testar envio
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setHistoryId(current =>
                    current === item.id ? null : item.id
                  )
                }
                aria-label={`Histórico webhook ${item.name}`}
              >
                {historyId === item.id ? "Ocultar histórico" : "Ver histórico"}
              </button>
              {canManage && editingId === item.id ? (
                <form
                  aria-label={`Editar webhook ${item.name}`}
                  onSubmit={event => {
                    event.preventDefault();
                    if (!editEvents.length) return;
                    void update(item, {
                      name: editName.trim(),
                      targetUrl: editTargetUrl,
                      eventTypes: editEvents,
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <legend>Editar assinatura</legend>
                    <label>
                      Nome da assinatura
                      <input
                        required
                        maxLength={160}
                        value={editName}
                        onChange={event => setEditName(event.target.value)}
                      />
                    </label>
                    <label>
                      URL da assinatura
                      <input
                        required
                        type="url"
                        maxLength={2048}
                        value={editTargetUrl}
                        onChange={event => setEditTargetUrl(event.target.value)}
                      />
                    </label>
                    <fieldset>
                      <legend>Eventos da assinatura</legend>
                      {events.map(option => (
                        <label
                          key={option.value}
                          className="workspace-checkbox"
                        >
                          <input
                            type="checkbox"
                            checked={editEvents.includes(option.value)}
                            onChange={event =>
                              setEditEvents(current =>
                                event.target.checked
                                  ? [...current, option.value]
                                  : current.filter(
                                      value => value !== option.value
                                    )
                              )
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </fieldset>
                    <button type="submit" disabled={busy || !editEvents.length}>
                      Salvar alterações
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Cancelar edição
                    </button>
                  </fieldset>
                </form>
              ) : null}
              {canManage && confirmId === item.id ? (
                <div
                  role="group"
                  aria-label={`Confirmar status de ${item.name}`}
                >
                  <p>
                    {item.isActive
                      ? "Desativar a assinatura e cancelar envios pendentes?"
                      : "Reativar a assinatura para novos eventos?"}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void update(item, { isActive: !item.isActive })
                    }
                  >
                    {item.isActive
                      ? "Confirmar desativação"
                      : "Confirmar ativação"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmId(null)}
                  >
                    Cancelar
                  </button>
                </div>
              ) : null}
              {historyId === item.id ? (
                <section aria-label={`Histórico de ${item.name}`}>
                  <h3>Últimos envios</h3>
                  {historyLoading ? (
                    <p role="status">Consultando entregas...</p>
                  ) : null}
                  {historyError ? <p role="alert">{historyError}</p> : null}
                  {!historyLoading && history?.length === 0 ? (
                    <p>Nenhuma entrega registrada.</p>
                  ) : null}
                  {!historyLoading && history ? (
                    <ul>
                      {history.map(dispatch => (
                        <li key={dispatch.id}>
                          <strong>{dispatch.eventType}</strong> —{" "}
                          {dispatch.status}
                          <p>Tentativas: {dispatch.attemptCount}</p>
                          {dispatch.deliveries.map(delivery => (
                            <p key={delivery.id}>
                              Tentativa {delivery.attempt}: {delivery.status} —
                              HTTP {delivery.responseStatus ?? "sem resposta"}
                              {delivery.errorCode
                                ? ` — ${delivery.errorCode}`
                                : ""}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
