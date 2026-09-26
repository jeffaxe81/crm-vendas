"use client";

import {
  TICKET_FINAL_STATUSES,
  TICKET_STATUS_TRANSITIONS,
  type TicketStatus,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { SlaBadge } from "./sla-labels";
import {
  channelLabels,
  dateTime,
  priorityLabels,
  statusLabels,
  type TicketEventRecord,
  type TicketRecord,
} from "./ticket-labels";

type TicketDetailProps = {
  accessToken: string;
  ticket: TicketRecord;
  canWrite: boolean;
  currentUserId?: string;
  queueName?: string | null;
  queueNames?: ReadonlyMap<string, string>;
  onChange: (ticket: TicketRecord) => void;
  onClose: () => void;
};

function describeEvent(
  event: TicketEventRecord,
  queueNames: ReadonlyMap<string, string>
): string {
  const metadata = event.metadata ?? {};
  const queueLabel = (value: unknown) =>
    typeof value === "string" ? (queueNames.get(value) ?? "Fila") : "Sem fila";
  switch (event.type) {
    case "CREATED":
      return "Solicitação aberta";
    case "STATUS_CHANGED":
      return `Status: ${event.fromStatus ? statusLabels[event.fromStatus] : "—"} → ${
        event.toStatus ? statusLabels[event.toStatus] : "—"
      }`;
    case "ASSIGNED":
      if (metadata.autoAssigned === true) {
        return "Atribuída automaticamente pela fila";
      }
      if (metadata.selfAssigned === true) {
        return "Solicitação assumida";
      }
      return "Responsável alterado";
    case "UPDATED":
      if ("fromQueueId" in metadata || "toQueueId" in metadata) {
        return `Fila: ${queueLabel(metadata.fromQueueId)} → ${queueLabel(
          metadata.toQueueId
        )}`;
      }
      return "Dados atualizados";
    default:
      return event.isInternal ? "Comentário interno" : "Comentário";
  }
}

/** C5.1 — detalhe da solicitação: timeline, status e comentários. */
export function TicketDetail({
  accessToken,
  ticket,
  canWrite,
  currentUserId,
  queueName = null,
  queueNames = new Map<string, string>(),
  onChange,
  onClose,
}: TicketDetailProps) {
  const [events, setEvents] = useState<TicketEventRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: TicketEventRecord[] }>(`/tickets/${ticket.id}/events`, {
      accessToken,
    })
      .then(result => {
        if (active) setEvents(result.items);
      })
      .catch(cause => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar a linha do tempo."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken, ticket.id, reload]);

  const transitions = TICKET_STATUS_TRANSITIONS[ticket.status];
  const isMine = Boolean(
    currentUserId && ticket.assigneeUserId === currentUserId
  );
  const canTakeOver =
    canWrite &&
    Boolean(currentUserId) &&
    !isMine &&
    !TICKET_FINAL_STATUSES.includes(ticket.status);

  async function assignToMe() {
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<TicketRecord>(
        `/tickets/${ticket.id}/assign-to-me`,
        {
          accessToken,
          method: "POST",
          body: { version: ticket.version },
        }
      );
      onChange(updated);
      setReload(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível assumir a solicitação."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextStatus) return;
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<TicketRecord>(
        `/tickets/${ticket.id}/status`,
        {
          accessToken,
          method: "POST",
          body: {
            status: nextStatus,
            ...(note.trim() ? { note: note.trim() } : {}),
            version: ticket.version,
          },
        }
      );
      onChange(updated);
      setNextStatus("");
      setNote("");
      setReload(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível mudar o status."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        ticket: TicketRecord;
        event: TicketEventRecord;
      }>(`/tickets/${ticket.id}/comments`, {
        accessToken,
        method: "POST",
        body: {
          body: comment.trim(),
          isInternal: internal,
          version: ticket.version,
        },
      });
      onChange(result.ticket);
      setEvents(current => [...current, result.event]);
      setComment("");
      setInternal(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível comentar."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="company-form"
      aria-label={`Solicitação ${ticket.protocol}`}
    >
      <div className="company-form__heading">
        <div>
          <p>Protocolo {ticket.protocol}</p>
          <h2>{ticket.subject}</h2>
        </div>
        <div className="support-queues__actions">
          {canTakeOver ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void assignToMe()}
            >
              Assumir
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>

      <dl className="ticket-detail__facts">
        <div>
          <dt>Status</dt>
          <dd>{statusLabels[ticket.status]}</dd>
        </div>
        <div>
          <dt>Prioridade</dt>
          <dd>{priorityLabels[ticket.priority]}</dd>
        </div>
        <div>
          <dt>Canal</dt>
          <dd>{channelLabels[ticket.channel]}</dd>
        </div>
        <div>
          <dt>Fila</dt>
          <dd>{queueName ?? "Sem fila"}</dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>
            {isMine
              ? "Você"
              : ticket.assigneeUserId
                ? "Outro membro"
                : "Sem responsável"}
          </dd>
        </div>
        <div>
          <dt>Aberta em</dt>
          <dd>{dateTime.format(new Date(ticket.openedAt))}</dd>
        </div>
        <div>
          <dt>1ª resposta até</dt>
          <dd>
            {ticket.firstResponseDueAt
              ? dateTime.format(new Date(ticket.firstResponseDueAt))
              : "—"}{" "}
            <SlaBadge state={ticket.sla?.firstResponse ?? null} />
          </dd>
        </div>
        <div>
          <dt>Resolução até</dt>
          <dd>
            {ticket.resolutionDueAt
              ? dateTime.format(new Date(ticket.resolutionDueAt))
              : "—"}{" "}
            <SlaBadge state={ticket.sla?.resolution ?? null} />
          </dd>
        </div>
      </dl>
      {ticket.description ? <p>{ticket.description}</p> : null}

      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}

      <ol className="ticket-detail__timeline" aria-label="Linha do tempo">
        {events.map(event => (
          <li
            key={event.id}
            className={event.isInternal ? "is-internal" : undefined}
          >
            <strong>{describeEvent(event, queueNames)}</strong>
            <span> · {dateTime.format(new Date(event.createdAt))}</span>
            {event.body ? <p>{event.body}</p> : null}
          </li>
        ))}
      </ol>

      {canWrite && transitions.length > 0 ? (
        <form aria-label="Alterar status" onSubmit={submitStatus}>
          <label>
            <span>Novo status</span>
            <select
              value={nextStatus}
              disabled={busy}
              onChange={event =>
                setNextStatus(event.target.value as TicketStatus | "")
              }
            >
              <option value="">Selecione</option>
              {transitions.map(status => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Observação</span>
            <input
              value={note}
              disabled={busy}
              onChange={event => setNote(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="button"
            disabled={busy || !nextStatus}
          >
            Aplicar status
          </button>
        </form>
      ) : null}

      {canWrite ? (
        <form aria-label="Comentar" onSubmit={submitComment}>
          <label>
            <span>Comentário</span>
            <textarea
              value={comment}
              disabled={busy}
              onChange={event => setComment(event.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={internal}
              disabled={busy}
              onChange={event => setInternal(event.target.checked)}
            />
            <span>Comentário interno</span>
          </label>
          <button type="submit" className="button" disabled={busy}>
            Comentar
          </button>
        </form>
      ) : null}
    </section>
  );
}
