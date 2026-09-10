"use client";

import type { ActivityCreateInput, ActivityUpdateInput } from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type ActivityStatus = "PENDING" | "COMPLETED" | "CANCELLED";
type ActivityType = "TASK" | "APPOINTMENT";
type ActivityPriority = "LOW" | "MEDIUM" | "HIGH";

type ActivityRecord = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  priority: ActivityPriority;
  title: string;
  description: string | null;
  companyId: string | null;
  contactId: string | null;
  ownerUserId: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

type CompanyOption = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type ContactOption = {
  id: string;
  fullName: string;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

type ActivityListResponse = ListResponse<ActivityRecord>;

type ActivitiesViewProps = {
  accessToken: string;
  ownerUserId: string;
  canWrite: boolean;
};

type ActivityFormState = {
  type: ActivityType;
  priority: ActivityPriority;
  title: string;
  description: string;
  dueAt: string;
  companyId: string;
  contactId: string;
};

const emptyForm: ActivityFormState = {
  type: "TASK",
  priority: "MEDIUM",
  title: "",
  description: "",
  dueAt: "",
  companyId: "",
  contactId: "",
};

const statusLabels: Record<ActivityStatus, string> = {
  PENDING: "Pendentes",
  COMPLETED: "Concluídas",
  CANCELLED: "Canceladas",
};

const typeLabels: Record<ActivityType, string> = {
  TASK: "Tarefa",
  APPOINTMENT: "Compromisso",
};

const priorityLabels: Record<ActivityPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function isOverdue(activity: ActivityRecord): boolean {
  return (
    activity.status === "PENDING" &&
    activity.dueAt !== null &&
    new Date(activity.dueAt).getTime() < Date.now()
  );
}

export function ActivitiesView({
  accessToken,
  ownerUserId,
  canWrite,
}: ActivitiesViewProps) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [status, setStatus] = useState<ActivityStatus>("PENDING");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ActivityFormState>(emptyForm);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [transitioningActivityId, setTransitioningActivityId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let active = true;

    async function loadActivities() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: "1",
        limit: "20",
        status,
        sortBy: "dueAt",
        sortOrder: "asc",
      });
      if (query) {
        params.set("q", query);
      }

      try {
        const result = await apiRequest<ActivityListResponse>(
          `/activities?${params.toString()}`,
          { accessToken }
        );
        if (active) {
          setActivities(result.items);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as atividades."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadActivities();

    return () => {
      active = false;
    };
  }, [accessToken, query, refreshVersion, status]);

  async function openCreate() {
    setError("");
    setForm(emptyForm);
    setFormOpen(true);

    try {
      const [companyResult, contactResult] = await Promise.all([
        apiRequest<ListResponse<CompanyOption>>("/companies?page=1&limit=100", {
          accessToken,
        }),
        apiRequest<ListResponse<ContactOption>>("/contacts?page=1&limit=100", {
          accessToken,
        }),
      ]);
      setCompanies(companyResult.items);
      setContacts(contactResult.items);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os vínculos comerciais."
      );
    }
  }

  function closeForm() {
    setFormOpen(false);
    setForm(emptyForm);
  }

  async function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setError("");
    const title = form.title.trim();
    if (!title) {
      setError("Informe o título da atividade.");
      return;
    }

    const payload: ActivityCreateInput = {
      type: form.type,
      priority: form.priority,
      title,
      ownerUserId,
      ...(form.description.trim()
        ? { description: form.description.trim() }
        : {}),
      ...(form.companyId ? { companyId: form.companyId } : {}),
      ...(form.contactId ? { contactId: form.contactId } : {}),
      ...(form.dueAt ? { dueAt: new Date(form.dueAt).toISOString() } : {}),
    };

    setSubmitting(true);
    try {
      await apiRequest<ActivityRecord>("/activities", {
        accessToken,
        method: "POST",
        body: payload,
      });
      closeForm();
      setRefreshVersion(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a atividade."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function completeActivity(activityId: string) {
    if (transitioningActivityId !== null) {
      return;
    }

    setError("");
    setTransitioningActivityId(activityId);
    const payload: ActivityUpdateInput = { status: "COMPLETED" };

    try {
      await apiRequest<ActivityRecord>(`/activities/${activityId}`, {
        accessToken,
        method: "PATCH",
        body: payload,
      });
      setRefreshVersion(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a atividade."
      );
    } finally {
      setTransitioningActivityId(null);
    }
  }

  async function cancelActivity(activityId: string) {
    if (transitioningActivityId !== null) {
      return;
    }

    setError("");
    setTransitioningActivityId(activityId);
    const payload: ActivityUpdateInput = { status: "CANCELLED" };

    try {
      await apiRequest<ActivityRecord>(`/activities/${activityId}`, {
        accessToken,
        method: "PATCH",
        body: payload,
      });
      setRefreshVersion(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível cancelar a atividade."
      );
    } finally {
      setTransitioningActivityId(null);
    }
  }

  async function reopenActivity(activityId: string) {
    if (transitioningActivityId !== null) {
      return;
    }

    setError("");
    setTransitioningActivityId(activityId);
    const payload: ActivityUpdateInput = { status: "PENDING" };

    try {
      await apiRequest<ActivityRecord>(`/activities/${activityId}`, {
        accessToken,
        method: "PATCH",
        body: payload,
      });
      setRefreshVersion(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível reabrir a atividade."
      );
    } finally {
      setTransitioningActivityId(null);
    }
  }

  async function inactivateActivity(activityId: string) {
    if (transitioningActivityId !== null) {
      return;
    }

    setError("");
    setTransitioningActivityId(activityId);

    try {
      await apiRequest<void>(`/activities/${activityId}`, {
        accessToken,
        method: "DELETE",
      });
      setRefreshVersion(current => current + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível inativar a atividade."
      );
    } finally {
      setTransitioningActivityId(null);
    }
  }

  return (
    <section className="activities-view" aria-labelledby="activities-title">
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Rotina comercial</p>
          <h1 id="activities-title">Atividades e compromissos</h1>
          <p>Organize tarefas e próximos passos da operação comercial.</p>
        </div>
        {canWrite ? (
          <button
            className="button activities-view__primary"
            onClick={openCreate}
          >
            Nova atividade
          </button>
        ) : null}
      </header>

      <form
        className="activities-view__search"
        role="search"
        onSubmit={event => {
          event.preventDefault();
          setQuery(queryInput.trim());
        }}
      >
        <label htmlFor="activities-search">Buscar atividades</label>
        <div>
          <input
            id="activities-search"
            type="search"
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
          <button type="submit">Buscar</button>
        </div>
      </form>

      <nav
        className="activities-view__status-tabs"
        aria-label="Status das atividades"
      >
        {(Object.keys(statusLabels) as ActivityStatus[]).map(option => (
          <button
            key={option}
            type="button"
            className={status === option ? "is-active" : undefined}
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
          >
            {statusLabels[option]}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="activities-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {canWrite && formOpen ? (
        <form
          className="activity-form"
          aria-label="Nova atividade"
          onSubmit={submitActivity}
        >
          <div className="activity-form__heading">
            <div>
              <p>Novo registro</p>
              <h2>Nova atividade</h2>
            </div>
            <button type="button" onClick={closeForm}>
              Cancelar
            </button>
          </div>

          <div className="activity-form__fields">
            <label htmlFor="activity-title">
              <span>Título</span>
              <input
                id="activity-title"
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label htmlFor="activity-type">
              <span>Tipo</span>
              <select
                id="activity-type"
                value={form.type}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    type: event.target.value as ActivityType,
                  }))
                }
              >
                <option value="TASK">Tarefa</option>
                <option value="APPOINTMENT">Compromisso</option>
              </select>
            </label>

            <label htmlFor="activity-priority">
              <span>Prioridade</span>
              <select
                id="activity-priority"
                value={form.priority}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    priority: event.target.value as ActivityPriority,
                  }))
                }
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
              </select>
            </label>

            <label htmlFor="activity-due-at">
              <span>Prazo</span>
              <input
                id="activity-due-at"
                type="datetime-local"
                value={form.dueAt}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </label>

            <label htmlFor="activity-company">
              <span>Empresa</span>
              <select
                id="activity-company"
                value={form.companyId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    companyId: event.target.value,
                  }))
                }
              >
                <option value="">Sem empresa</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.tradeName || company.legalName}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="activity-contact">
              <span>Contato</span>
              <select
                id="activity-contact"
                value={form.contactId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    contactId: event.target.value,
                  }))
                }
              >
                <option value="">Sem contato</option>
                {contacts.map(contact => (
                  <option key={contact.id} value={contact.id}>
                    {contact.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label
              className="activity-form__description"
              htmlFor="activity-description"
            >
              <span>Descrição</span>
              <textarea
                id="activity-description"
                rows={4}
                value={form.description}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button
            className="button activity-form__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Salvando..." : "Salvar atividade"}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="activities-view__status">Carregando atividades...</p>
      ) : null}

      {!loading && !error && activities.length > 0 ? (
        <ul className="activities-view__list">
          {activities.map(activity => {
            const overdue = isOverdue(activity);

            return (
              <li
                key={activity.id}
                className={
                  overdue
                    ? "activities-view__item is-overdue"
                    : "activities-view__item"
                }
              >
                <div className="activities-view__item-heading">
                  <span>{typeLabels[activity.type]}</span>
                  {overdue ? (
                    <span className="activities-view__overdue">Atrasada</span>
                  ) : null}
                </div>
                <strong>{activity.title}</strong>
                {activity.description ? <p>{activity.description}</p> : null}
                <div className="activities-view__item-meta">
                  <span>Prioridade: {priorityLabels[activity.priority]}</span>
                  {activity.dueAt ? (
                    <span>
                      Prazo:{" "}
                      {dateTimeFormatter.format(new Date(activity.dueAt))}
                    </span>
                  ) : (
                    <span>Sem prazo</span>
                  )}
                </div>
                {canWrite && activity.status === "PENDING" ? (
                  <div className="activities-view__item-actions">
                    <button
                      type="button"
                      disabled={transitioningActivityId === activity.id}
                      onClick={() => void completeActivity(activity.id)}
                    >
                      {transitioningActivityId === activity.id
                        ? "Concluindo..."
                        : "Concluir"}
                    </button>
                    <button
                      type="button"
                      disabled={transitioningActivityId === activity.id}
                      onClick={() => void cancelActivity(activity.id)}
                    >
                      {transitioningActivityId === activity.id
                        ? "Cancelando..."
                        : "Cancelar atividade"}
                    </button>
                    <button
                      type="button"
                      disabled={transitioningActivityId === activity.id}
                      onClick={() => void inactivateActivity(activity.id)}
                    >
                      {transitioningActivityId === activity.id
                        ? "Inativando..."
                        : "Inativar"}
                    </button>
                  </div>
                ) : null}
                {canWrite && activity.status !== "PENDING" ? (
                  <div className="activities-view__item-actions">
                    <button
                      type="button"
                      disabled={transitioningActivityId === activity.id}
                      onClick={() => void reopenActivity(activity.id)}
                    >
                      {transitioningActivityId === activity.id
                        ? "Reabrindo..."
                        : "Reabrir"}
                    </button>
                    <button
                      type="button"
                      disabled={transitioningActivityId === activity.id}
                      onClick={() => void inactivateActivity(activity.id)}
                    >
                      {transitioningActivityId === activity.id
                        ? "Inativando..."
                        : "Inativar"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error && activities.length === 0 ? (
        <div className="activities-view__empty">
          <strong>
            Nenhuma atividade em {statusLabels[status].toLowerCase()}.
          </strong>
          <span>As atividades deste status aparecerão aqui.</span>
        </div>
      ) : null}
    </section>
  );
}
