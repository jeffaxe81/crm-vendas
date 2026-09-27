"use client";

import {
  TicketChannelSchema,
  TicketPrioritySchema,
  TicketStatusSchema,
  type TicketChannel,
  type TicketPriority,
  type TicketStatus,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { SupportQueuesPanel } from "./support-queues-panel";
import { SlaBadge, worstSlaState } from "./sla-labels";
import { SlaPoliciesPanel } from "./sla-policies-panel";
import { TicketDetail } from "./ticket-detail";
import {
  channelLabels,
  dateTime,
  priorityLabels,
  statusLabels,
  type SupportQueueRecord,
  type TicketRecord,
} from "./ticket-labels";

type TicketsViewProps = {
  accessToken: string;
  canWrite: boolean;
  /** C5.2 — usuário autenticado (botão "Assumir"). */
  currentUserId?: string;
  /** C5.2 — `support.manage`: exibe a gestão de filas. */
  canManageQueues?: boolean;
  /** C5.3 — `support.manage`: configura as políticas de SLA. */
  canManageSla?: boolean;
};

type NewTicketForm = {
  subject: string;
  description: string;
  priority: TicketPriority;
  channel: TicketChannel;
  queueId: string;
};

const emptyForm: NewTicketForm = {
  subject: "",
  description: "",
  priority: "MEDIUM",
  channel: "PHONE",
  queueId: "",
};

/**
 * C5.1 — Atendimento: lista, abertura e detalhe de solicitações.
 * C5.2 — filas: filtro, "Minhas solicitações", fila na abertura, "Assumir"
 * e gestão de filas (com `support.manage`).
 * C5.3 — indicadores e políticas de SLA (com `support.manage`).
 */
export function TicketsView({
  accessToken,
  canWrite,
  currentUserId,
  canManageQueues = false,
  canManageSla = false,
}: TicketsViewProps) {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NewTicketForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [queues, setQueues] = useState<SupportQueueRecord[]>([]);
  const [queueFilter, setQueueFilter] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [queuesOpen, setQueuesOpen] = useState(false);
  const [queuesRefresh, setQueuesRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: SupportQueueRecord[] }>("/support-queues", {
      accessToken,
    })
      .then(result => {
        if (active) setQueues(result.items);
      })
      .catch(() => {
        // Filas são opcionais: a lista de solicitações continua funcionando.
        if (active) setQueues([]);
      });
    return () => {
      active = false;
    };
  }, [accessToken, queuesRefresh]);
  const [slaOpen, setSlaOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: "1", limit: "50" });
      if (status) params.set("status", status);
      if (query) params.set("q", query);
      if (queueFilter) params.set("queueId", queueFilter);
      if (onlyMine) params.set("assigneeUserId", "me");
      try {
        const result = await apiRequest<{ items: TicketRecord[] }>(
          `/tickets?${params.toString()}`,
          { accessToken }
        );
        if (active) setTickets(result.items);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as solicitações."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, status, query, queueFilter, onlyMine, refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = form.subject.trim();
    if (!subject) {
      setError("Informe o assunto.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await apiRequest<TicketRecord>("/tickets", {
        accessToken,
        method: "POST",
        body: {
          subject,
          ...(form.description.trim()
            ? { description: form.description.trim() }
            : {}),
          priority: form.priority,
          channel: form.channel,
          ...(form.queueId ? { queueId: form.queueId } : {}),
        },
      });
      setFormOpen(false);
      setForm(emptyForm);
      setSelectedId(created.id);
      setRefresh(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir a solicitação."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selected = tickets.find(ticket => ticket.id === selectedId) ?? null;
  const queueNames = new Map(queues.map(queue => [queue.id, queue.name]));
  const activeQueues = queues.filter(queue => queue.isActive);

  return (
    <section className="companies-view" aria-labelledby="tickets-title">
      <header className="companies-view__header">
        <div>
          <p className="companies-view__eyebrow">Atendimento</p>
          <h1 id="tickets-title">Solicitações</h1>
          <p>Protocolos, andamento e histórico do atendimento aos clientes.</p>
        </div>
        {canWrite || canManageQueues || canManageSla ? (
          <div className="companies-view__header-actions">
            {canManageQueues ? (
              <button type="button" onClick={() => setQueuesOpen(true)}>
                Gerenciar filas
              </button>
            ) : null}
            {canManageSla ? (
              <button type="button" onClick={() => setSlaOpen(true)}>
                Políticas de SLA
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                className="button companies-view__primary"
                onClick={() => setFormOpen(true)}
              >
                Nova solicitação
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <form
        className="companies-view__toolbar"
        role="search"
        onSubmit={event => {
          event.preventDefault();
          setQuery(queryInput.trim());
        }}
      >
        <label>
          <span>Buscar solicitações</span>
          <input
            type="search"
            aria-label="Buscar solicitações"
            placeholder="Protocolo ou assunto"
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            aria-label="Filtrar por status"
            value={status}
            onChange={event =>
              setStatus(event.target.value as TicketStatus | "")
            }
          >
            <option value="">Todos</option>
            {TicketStatusSchema.options.map(option => (
              <option key={option} value={option}>
                {statusLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fila</span>
          <select
            aria-label="Filtrar por fila"
            value={queueFilter}
            onChange={event => setQueueFilter(event.target.value)}
          >
            <option value="">Todas</option>
            {queues.map(queue => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Buscar</button>
        <button
          type="button"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine(current => !current)}
        >
          Minhas solicitações
        </button>
      </form>

      {canManageQueues && queuesOpen ? (
        <SupportQueuesPanel
          accessToken={accessToken}
          queues={queues}
          onChanged={() => setQueuesRefresh(current => current + 1)}
          onClose={() => setQueuesOpen(false)}
        />
      ) : null}

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {canManageSla && slaOpen ? (
        <SlaPoliciesPanel
          accessToken={accessToken}
          onClose={() => {
            setSlaOpen(false);
            setRefresh(current => current + 1);
          }}
        />
      ) : null}

      {formOpen ? (
        <form
          className="company-form"
          aria-label="Nova solicitação"
          onSubmit={submit}
        >
          <div className="company-form__heading">
            <div>
              <p>Abertura</p>
              <h2>Nova solicitação</h2>
            </div>
            <button type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
          </div>
          <div className="company-form__fields">
            <label>
              <span>Assunto</span>
              <input
                value={form.subject}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Descrição</span>
              <textarea
                value={form.description}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Prioridade</span>
              <select
                value={form.priority}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    priority: event.target.value as TicketPriority,
                  }))
                }
              >
                {TicketPrioritySchema.options.map(option => (
                  <option key={option} value={option}>
                    {priorityLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Canal</span>
              <select
                value={form.channel}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    channel: event.target.value as TicketChannel,
                  }))
                }
              >
                {TicketChannelSchema.options.map(option => (
                  <option key={option} value={option}>
                    {channelLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Fila de atendimento</span>
              <select
                value={form.queueId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    queueId: event.target.value,
                  }))
                }
              >
                <option value="">Sem fila</option>
                {activeQueues.map(queue => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                    {queue.autoAssign ? " (distribuição automática)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Abrindo..." : "Abrir solicitação"}
          </button>
        </form>
      ) : null}

      {selected ? (
        <TicketDetail
          accessToken={accessToken}
          ticket={selected}
          canWrite={canWrite}
          currentUserId={currentUserId}
          queueName={
            selected.queueId ? (queueNames.get(selected.queueId) ?? null) : null
          }
          queueNames={queueNames}
          onChange={updated =>
            setTickets(current =>
              current.map(ticket =>
                ticket.id === updated.id ? updated : ticket
              )
            )
          }
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {loading ? <p>Carregando solicitações...</p> : null}
      {!loading && tickets.length === 0 ? (
        <p>Nenhuma solicitação encontrada.</p>
      ) : null}

      {!loading && tickets.length > 0 ? (
        <div className="company-import__table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Protocolo</th>
                <th>Assunto</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Fila</th>
                <th>Aberta em</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      aria-label={`Abrir ${ticket.protocol}`}
                    >
                      {ticket.protocol}
                    </button>
                  </td>
                  <td>{ticket.subject}</td>
                  <td>{statusLabels[ticket.status]}</td>
                  <td>{priorityLabels[ticket.priority]}</td>
                  <td>
                    {ticket.queueId
                      ? (queueNames.get(ticket.queueId) ?? "—")
                      : "—"}
                  </td>
                  <td>{dateTime.format(new Date(ticket.openedAt))}</td>
                  <td>
                    <SlaBadge state={worstSlaState(ticket.sla)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
