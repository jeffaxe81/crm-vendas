"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  WebhookSubscriptionSummarySchema,
  WebhookSubscriptionCreatedSchema,
  type WebhookSubscriptionSummary,
  type WebhookEventType,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";

const events: Array<{ value: WebhookEventType; label: string }> = [
  { value: "company.created", label: "Empresa criada" },
  { value: "opportunity.won", label: "Oportunidade ganha" },
  { value: "opportunity.lost", label: "Oportunidade perdida" },
  { value: "ticket.closed", label: "Chamado encerrado" },
];

export function WebhookSubscriptionsView({
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
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    setSecret("");
    setItems([]);
    void apiRequest<unknown>("/integrations/webhooks", { accessToken })
      .then(payload => {
        const parsed = WebhookSubscriptionSummarySchema.array().parse(payload);
        if (active) setItems(parsed);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Falha ao listar webhooks."
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken, reload]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || secret) return;
    setBusy(true);
    setError("");
    try {
      const payload = await apiRequest<unknown>("/integrations/webhooks", {
        accessToken,
        method: "POST",
        body: { name: name.trim(), targetUrl, eventTypes },
      });
      const parsed = WebhookSubscriptionCreatedSchema.parse(payload);
      setItems(current => [parsed, ...current]);
      setSecret(parsed.plainSecret);
      setName("");
      setTargetUrl("");
      setEventTypes([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao criar webhook."
      );
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
          <fieldset disabled={busy}>
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
                          : current.filter(item => item !== option.value)
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
        disabled={busy}
        onClick={() => setReload(value => value + 1)}
      >
        Atualizar webhooks
      </button>
      {items.length === 0 ? (
        <p>Nenhum webhook cadastrado.</p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item.id}>
              <strong>{item.name}</strong> — {item.isActive ? "Ativo" : "Inativo"}
              <p>{item.targetUrl}</p>
              <p>{item.eventTypes.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
