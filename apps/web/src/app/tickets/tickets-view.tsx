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
import { downloadLoadedCsv } from "../../lib/local-productivity-export";
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
import { useTranslation } from "../../i18n/language-provider";

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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
  const requestScope = JSON.stringify([
    accessToken,
    status,
    query,
    queueFilter,
    onlyMine,
    refresh,
    page,
  ]);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);

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
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (status) params.set("status", status);
      if (query) params.set("q", query);
      if (queueFilter) params.set("queueId", queueFilter);
      if (onlyMine) params.set("assigneeUserId", "me");
      try {
        const result = await apiRequest<{
          items: TicketRecord[];
          total: number;
        }>(`/tickets?${params.toString()}`, { accessToken });
        if (active) {
          setTickets(result.items);
          setLoadedScope(requestScope);
          const count = result.total ?? result.items.length;
          setTotal(count);
          const lastPage = Math.max(1, Math.ceil(count / 50));
          if (page > lastPage) {
            setPage(lastPage);
            setSelectedId(null);
          }
        }
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
  }, [
    accessToken,
    status,
    query,
    queueFilter,
    onlyMine,
    refresh,
    page,
    requestScope,
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = form.subject.trim();
    if (!subject) {
      setError(t("Informe o assunto."));
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
  const canExport =
    !loading && !error && tickets.length > 0 && loadedScope === requestScope;

  return (
    <section className="companies-view" aria-labelledby="tickets-title">
      <header className="companies-view__header">
        <div>
          <p className="companies-view__eyebrow">{t("Atendimento")}</p>
          <h1 id="tickets-title">{t("Solicitações")}</h1>
          <p>
            {t(
              "Protocolos, andamento e histórico do atendimento aos clientes."
            )}
          </p>
        </div>
        <div className="companies-view__header-actions">
          <button
            type="button"
            disabled={!canExport}
            title={t("Exporta somente as solicitações da página atual.")}
            onClick={() => {
              if (!canExport) return;
              downloadLoadedCsv(
                "solicitacoes.csv",
                [
                  "Protocolo",
                  "Assunto",
                  "Status",
                  "Prioridade",
                  "Fila",
                  "Aberta em",
                ].map(label => t(label)),
                tickets.map(ticket => [
                  ticket.protocol,
                  ticket.subject,
                  t(statusLabels[ticket.status]),
                  t(priorityLabels[ticket.priority]),
                  ticket.queueId ? (queueNames.get(ticket.queueId) ?? "") : "",
                  ticket.openedAt,
                ])
              );
            }}
          >
            {t("Exportar solicitações CSV")}
          </button>
          {canManageQueues ? (
            <button type="button" onClick={() => setQueuesOpen(true)}>
              {t("Gerenciar filas")}
            </button>
          ) : null}
          {canManageSla ? (
            <button type="button" onClick={() => setSlaOpen(true)}>
              {t("Políticas de SLA")}
            </button>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              className="button companies-view__primary"
              onClick={() => setFormOpen(true)}
            >
              {t("Nova solicitação")}
            </button>
          ) : null}
        </div>
      </header>

      <form
        className="companies-view__toolbar"
        role="search"
        onSubmit={event => {
          event.preventDefault();
          setQuery(queryInput.trim());
          setPage(1);
          setSelectedId(null);
        }}
      >
        <label>
          <span>{t("Buscar solicitações")}</span>
          <input
            type="search"
            aria-label={t("Buscar solicitações")}
            placeholder={t("Protocolo ou assunto")}
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
        </label>
        <label>
          <span>{t("Status")}</span>
          <select
            aria-label={t("Filtrar por status")}
            value={status}
            onChange={event => {
              setStatus(event.target.value as TicketStatus | "");
              setPage(1);
              setSelectedId(null);
            }}
          >
            <option value="">{t("Todos")}</option>
            {TicketStatusSchema.options.map(option => (
              <option key={option} value={option}>
                {t(statusLabels[option])}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("Fila")}</span>
          <select
            aria-label={t("Filtrar por fila")}
            value={queueFilter}
            onChange={event => {
              setQueueFilter(event.target.value);
              setPage(1);
              setSelectedId(null);
            }}
          >
            <option value="">{t("Todas")}</option>
            {queues.map(queue => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t("Buscar")}</button>
        <button
          type="button"
          aria-pressed={onlyMine}
          onClick={() => {
            setOnlyMine(current => !current);
            setPage(1);
            setSelectedId(null);
          }}
        >
          {t("Minhas solicitações")}
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
          {t(error)}
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
          aria-label={t("Nova solicitação")}
          onSubmit={submit}
        >
          <div className="company-form__heading">
            <div>
              <p>{t("Abertura")}</p>
              <h2>{t("Nova solicitação")}</h2>
            </div>
            <button type="button" onClick={() => setFormOpen(false)}>
              {t("Cancelar")}
            </button>
          </div>
          <div className="company-form__fields">
            <label>
              <span>{t("Assunto")}</span>
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
              <span>{t("Descrição")}</span>
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
              <span>{t("Prioridade")}</span>
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
                    {t(priorityLabels[option])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("Canal")}</span>
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
                    {t(channelLabels[option])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("Fila de atendimento")}</span>
              <select
                value={form.queueId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    queueId: event.target.value,
                  }))
                }
              >
                <option value="">{t("Sem fila")}</option>
                {activeQueues.map(queue => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                    {queue.autoAssign ? t(" (distribuição automática)") : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? t("Abrindo...") : t("Abrir solicitação")}
          </button>
        </form>
      ) : null}

      {selected ? (
        <TicketDetail
          key={selected.id}
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

      {loading ? <p>{t("Carregando solicitações...")}</p> : null}
      {!loading && tickets.length === 0 ? (
        <p>{t("Nenhuma solicitação encontrada.")}</p>
      ) : null}

      {!loading && tickets.length > 0 ? (
        <div
          className="company-import__table-wrapper"
          role="region"
          aria-label={t("Tabela: Atendimentos")}
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>{t("Protocolo")}</th>
                <th>{t("Assunto")}</th>
                <th>{t("Status")}</th>
                <th>{t("Prioridade")}</th>
                <th>{t("Fila")}</th>
                <th>{t("Aberta em")}</th>
                <th>{t("SLA")}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      aria-label={t("Abrir {0}", { 0: ticket.protocol })}
                    >
                      {ticket.protocol}
                    </button>
                  </td>
                  <td>{ticket.subject}</td>
                  <td>{t(statusLabels[ticket.status])}</td>
                  <td>{t(priorityLabels[ticket.priority])}</td>
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
      {!loading && !error && (total > 0 || page > 1) ? (
        <nav
          className="companies-view__pagination"
          aria-label={t("Paginação de solicitações")}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => {
              setPage(current => current - 1);
              setSelectedId(null);
            }}
          >
            {t("Anterior")}
          </button>
          <span>
            {t("Página ")}
            {page}
            {t(" de ")}
            {Math.max(1, Math.ceil(total / 50))} · {total} {t("solicitações")}
          </span>
          <button
            type="button"
            disabled={page * 50 >= total}
            onClick={() => {
              setPage(current => current + 1);
              setSelectedId(null);
            }}
          >
            {t("Próxima")}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
