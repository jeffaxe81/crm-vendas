"use client";

import { useEffect, useMemo, useState } from "react";

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
  dueAt: string | null;
};

type ActivityListResponse = {
  items: ActivityRecord[];
  page: number;
  limit: number;
  total: number;
};

type AgendaViewProps = {
  accessToken: string;
  ownerUserId: string;
};

type AgendaFilter<T extends string> = T | "ALL";

const typeLabels: Record<ActivityType, string> = {
  TASK: "Tarefa",
  APPOINTMENT: "Compromisso",
};

const statusLabels: Record<ActivityStatus, string> = {
  PENDING: "Pendente",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

const priorityLabels: Record<ActivityPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

const periodFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function startOfWeek(reference: Date): Date {
  const date = new Date(reference);
  const day = date.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + distanceToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(reference: Date): Date {
  const date = startOfWeek(reference);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addWeeks(reference: Date, amount: number): Date {
  const date = new Date(reference);
  date.setDate(date.getDate() + amount * 7);
  return date;
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AgendaView({ accessToken, ownerUserId }: AgendaViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [type, setType] = useState<AgendaFilter<ActivityType>>("ALL");
  const [status, setStatus] = useState<AgendaFilter<ActivityStatus>>("ALL");
  const [priority, setPriority] =
    useState<AgendaFilter<ActivityPriority>>("ALL");
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const period = useMemo(() => {
    const anchor = addWeeks(new Date(), weekOffset);
    return {
      from: startOfWeek(anchor),
      to: endOfWeek(anchor),
    };
  }, [weekOffset]);

  useEffect(() => {
    let active = true;

    async function loadAgenda() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: "1",
        limit: "100",
        ownerUserId,
        dueFrom: period.from.toISOString(),
        dueTo: period.to.toISOString(),
        sortBy: "dueAt",
        sortOrder: "asc",
      });

      if (type !== "ALL") {
        params.set("type", type);
      }
      if (status !== "ALL") {
        params.set("status", status);
      }
      if (priority !== "ALL") {
        params.set("priority", priority);
      }

      try {
        const result = await apiRequest<ActivityListResponse>(
          `/activities?${params.toString()}`,
          { accessToken }
        );
        if (active) {
          setActivities(result.items.filter(activity => activity.dueAt !== null));
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar a agenda."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAgenda();

    return () => {
      active = false;
    };
  }, [accessToken, ownerUserId, period, priority, status, type]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityRecord[]>();
    for (const activity of activities) {
      if (!activity.dueAt) {
        continue;
      }
      const key = localDateKey(activity.dueAt);
      const current = groups.get(key) ?? [];
      current.push(activity);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right)
    );
  }, [activities]);

  return (
    <section className="activities-view" aria-labelledby="agenda-title">
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Produtividade comercial</p>
          <h1 id="agenda-title">Agenda Comercial</h1>
          <p>
            Acompanhe suas tarefas e compromissos da semana em ordem
            cronológica.
          </p>
        </div>
      </header>

      <nav className="activities-view__status-tabs" aria-label="Período da agenda">
        <button type="button" onClick={() => setWeekOffset(value => value - 1)}>
          Anterior
        </button>
        <button type="button" onClick={() => setWeekOffset(0)}>
          Hoje
        </button>
        <button type="button" onClick={() => setWeekOffset(value => value + 1)}>
          Próximo
        </button>
      </nav>

      <p className="activities-view__status">
        {periodFormatter.format(period.from)} a {periodFormatter.format(period.to)}
      </p>

      <div className="activity-form__fields" aria-label="Filtros da agenda">
        <label htmlFor="agenda-type">
          <span>Tipo</span>
          <select
            id="agenda-type"
            value={type}
            onChange={event =>
              setType(event.target.value as AgendaFilter<ActivityType>)
            }
          >
            <option value="ALL">Todos</option>
            <option value="TASK">Tarefa</option>
            <option value="APPOINTMENT">Compromisso</option>
          </select>
        </label>

        <label htmlFor="agenda-status">
          <span>Status</span>
          <select
            id="agenda-status"
            value={status}
            onChange={event =>
              setStatus(event.target.value as AgendaFilter<ActivityStatus>)
            }
          >
            <option value="ALL">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="COMPLETED">Concluída</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </label>

        <label htmlFor="agenda-priority">
          <span>Prioridade</span>
          <select
            id="agenda-priority"
            value={priority}
            onChange={event =>
              setPriority(event.target.value as AgendaFilter<ActivityPriority>)
            }
          >
            <option value="ALL">Todas</option>
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="activities-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">Carregando agenda...</p>
      ) : null}

      {!loading && !error && grouped.length === 0 ? (
        <p className="activities-view__status">
          Nenhuma atividade com prazo nesta semana.
        </p>
      ) : null}

      {!loading && !error && grouped.length > 0 ? (
        <div className="activities-view__list">
          {grouped.map(([dateKey, dayActivities]) => {
            const reference = dayActivities[0]?.dueAt;
            if (!reference) {
              return null;
            }

            return (
              <section key={dateKey} aria-labelledby={`agenda-day-${dateKey}`}>
                <h2 id={`agenda-day-${dateKey}`}>
                  {dayFormatter.format(new Date(reference))}
                </h2>
                <ul className="activities-view__list">
                  {dayActivities.map(activity => (
                    <li key={activity.id} className="activity-card">
                      <div>
                        <strong>{activity.title}</strong>
                        <p>
                          {activity.dueAt
                            ? timeFormatter.format(new Date(activity.dueAt))
                            : "Sem horário"}
                        </p>
                      </div>
                      <div>
                        <span>{typeLabels[activity.type]}</span>
                        <span>{priorityLabels[activity.priority]}</span>
                        <span>{statusLabels[activity.status]}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
