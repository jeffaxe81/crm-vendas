"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import {
  downloadLoadedCalendar,
  downloadLoadedCsv,
} from "../../lib/local-productivity-export";
import { useTranslation } from "../../i18n/language-provider";

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
  initialFocus?: "WEEK" | "TODAY" | "OVERDUE";
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

export function AgendaView({
  accessToken,
  ownerUserId,
  initialFocus = "WEEK",
}: AgendaViewProps) {
  const { t } = useTranslation();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [focus, setFocus] = useState<"WEEK" | "TODAY" | "OVERDUE">(
    initialFocus
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [type, setType] = useState<AgendaFilter<ActivityType>>("ALL");
  const [status, setStatus] = useState<AgendaFilter<ActivityStatus>>("ALL");
  const [priority, setPriority] =
    useState<AgendaFilter<ActivityPriority>>("ALL");
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedScope, setLoadedScope] = useState("");

  const period = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (focus === "OVERDUE") {
      return { from: null, to: new Date(today.getTime() - 1) };
    }
    if (focus === "TODAY") {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { from: today, to: end };
    }
    const anchor = addWeeks(today, weekOffset);
    return {
      from: startOfWeek(anchor),
      to: endOfWeek(anchor),
    };
  }, [weekOffset, focus, refreshVersion]);

  const requestScope = JSON.stringify([
    accessToken,
    ownerUserId,
    period.from?.toISOString(),
    period.to.toISOString(),
    priority,
    status,
    type,
    page,
    focus,
  ]);
  const canExportCsv =
    !loading && !error && activities.length > 0 && loadedScope === requestScope;

  useEffect(() => {
    let active = true;

    async function loadAgenda() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: "100",
        ownerUserId,
        dueTo: period.to.toISOString(),
        sortBy: "dueAt",
        sortOrder: "asc",
      });

      if (period.from) params.set("dueFrom", period.from.toISOString());

      if (type !== "ALL") {
        params.set("type", type);
      }
      if (focus !== "WEEK") {
        params.set("status", "PENDING");
      } else if (status !== "ALL") {
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
          setTotal(result.total);
          setLoadedScope(requestScope);
          setActivities(
            result.items.filter(activity => activity.dueAt !== null)
          );
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
  }, [
    accessToken,
    ownerUserId,
    period,
    priority,
    status,
    type,
    page,
    focus,
    requestScope,
  ]);

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
          <p className="activities-view__eyebrow">
            {t("Produtividade comercial")}
          </p>
          <h1 id="agenda-title">{t("Agenda Comercial")}</h1>
          <p>
            {t(
              "Acompanhe suas tarefas e compromissos da semana em ordem cronológica."
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || activities.length === 0}
          title={t(
            "Exporta somente a página carregada; horários são provisórios"
          )}
          onClick={() =>
            downloadLoadedCalendar("crm-agenda-pagina.ics", activities)
          }
        >
          {t("Exportar agenda ICS")}
        </button>
        <button
          type="button"
          disabled={!canExportCsv}
          title={t("Exporta somente a página atual da agenda.")}
          onClick={() => {
            if (!canExportCsv) return;
            downloadLoadedCsv(
              "crm-agenda-pagina.csv",
              ["Título", "Tipo", "Status", "Prioridade", "Prazo"].map(label =>
                t(label)
              ),
              activities.map(item => [
                item.title,
                t(typeLabels[item.type]),
                t(statusLabels[item.status]),
                t(priorityLabels[item.priority]),
                item.dueAt,
              ])
            );
          }}
        >
          {t("Exportar agenda CSV")}
        </button>
      </header>

      <nav
        className="activities-view__status-tabs"
        aria-label={t("Foco da agenda")}
      >
        {(
          [
            ["WEEK", "Semana"],
            ["TODAY", "Pendentes de hoje"],
            ["OVERDUE", "Atrasadas"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={focus === value ? "is-active" : undefined}
            aria-pressed={focus === value}
            onClick={() => {
              setFocus(value);
              setPage(1);
            }}
          >
            {t(label)}
          </button>
        ))}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setPage(1);
            setRefreshVersion(value => value + 1);
          }}
        >
          {t("Atualizar agenda")}
        </button>
      </nav>

      {focus === "WEEK" ? (
        <nav
          className="activities-view__status-tabs"
          aria-label={t("Período da agenda")}
        >
          <button
            type="button"
            onClick={() => {
              setWeekOffset(value => value - 1);
              setPage(1);
            }}
          >
            {t("Anterior")}
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekOffset(0);
              setPage(1);
            }}
          >
            {t("Hoje")}
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekOffset(value => value + 1);
              setPage(1);
            }}
          >
            {t("Próximo")}
          </button>
        </nav>
      ) : null}

      <p className="activities-view__status">
        {focus === "OVERDUE"
          ? t("Pendências com prazo anterior a hoje.")
          : focus === "TODAY"
            ? t("Pendências de {0}", {
                0: periodFormatter.format(period.from!),
              })
            : `${periodFormatter.format(period.from!)} a ${periodFormatter.format(period.to)}`}
      </p>

      <div
        className="activity-form__fields"
        aria-label={t("Filtros da agenda")}
      >
        <label htmlFor="agenda-type">
          <span>{t("Tipo")}</span>
          <select
            id="agenda-type"
            value={type}
            onChange={event => {
              setType(event.target.value as AgendaFilter<ActivityType>);
              setPage(1);
            }}
          >
            <option value="ALL">{t("Todos")}</option>
            <option value="TASK">{t("Tarefa")}</option>
            <option value="APPOINTMENT">{t("Compromisso")}</option>
          </select>
        </label>

        <label htmlFor="agenda-status">
          <span>{t("Status")}</span>
          <select
            id="agenda-status"
            disabled={focus !== "WEEK"}
            value={focus === "WEEK" ? status : "PENDING"}
            onChange={event => {
              setStatus(event.target.value as AgendaFilter<ActivityStatus>);
              setPage(1);
            }}
          >
            <option value="ALL">{t("Todos")}</option>
            <option value="PENDING">{t("Pendente")}</option>
            <option value="COMPLETED">{t("Concluída")}</option>
            <option value="CANCELLED">{t("Cancelada")}</option>
          </select>
        </label>

        <label htmlFor="agenda-priority">
          <span>{t("Prioridade")}</span>
          <select
            id="agenda-priority"
            value={priority}
            onChange={event => {
              setPriority(event.target.value as AgendaFilter<ActivityPriority>);
              setPage(1);
            }}
          >
            <option value="ALL">{t("Todas")}</option>
            <option value="LOW">{t("Baixa")}</option>
            <option value="MEDIUM">{t("Média")}</option>
            <option value="HIGH">{t("Alta")}</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="activities-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">{t("Carregando agenda...")}</p>
      ) : null}

      {!loading && !error && grouped.length === 0 ? (
        <p className="activities-view__status">
          {focus === "OVERDUE"
            ? t("Nenhuma atividade pendente atrasada.")
            : focus === "TODAY"
              ? t("Nenhuma atividade pendente para hoje.")
              : t("Nenhuma atividade com prazo nesta semana.")}
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
                            : t("Sem horário")}
                        </p>
                      </div>
                      <div>
                        <span>{t(typeLabels[activity.type])}</span>
                        <span>{t(priorityLabels[activity.priority])}</span>
                        <span>{t(statusLabels[activity.status])}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {!loading && !error && total > 100 ? (
        <nav
          className="activities-view__status-tabs"
          aria-label={t("Páginas da agenda")}
        >
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(value => value - 1)}
          >
            {t("Página anterior")}
          </button>
          <span role="status">
            {t("Página ")}
            {page}
            {t(" de ")}
            {Math.ceil(total / 100)} · {total}
            {t(" atividades")}
          </span>
          <button
            type="button"
            disabled={page * 100 >= total}
            onClick={() => setPage(value => value + 1)}
          >
            {t("Próxima página")}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
