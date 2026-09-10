"use client";

import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type ActivityStatus = "PENDING" | "COMPLETED" | "CANCELLED";

type ActivityRecord = {
  id: string;
  title: string;
};

type ActivityListResponse = {
  items: ActivityRecord[];
  page: number;
  limit: number;
  total: number;
};

type ActivitiesViewProps = {
  accessToken: string;
  ownerUserId: string;
  canWrite: boolean;
};

const statusLabels: Record<ActivityStatus, string> = {
  PENDING: "Pendentes",
  COMPLETED: "Concluídas",
  CANCELLED: "Canceladas",
};

export function ActivitiesView({ accessToken }: ActivitiesViewProps) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [status, setStatus] = useState<ActivityStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadActivities() {
      setLoading(true);
      setError("");

      try {
        const result = await apiRequest<ActivityListResponse>(
          `/activities?page=1&limit=20&status=${status}&sortBy=dueAt&sortOrder=asc`,
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
  }, [accessToken, status]);

  return (
    <section className="activities-view" aria-labelledby="activities-title">
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Rotina comercial</p>
          <h1 id="activities-title">Atividades e compromissos</h1>
          <p>Organize tarefas e próximos passos da operação comercial.</p>
        </div>
      </header>

      <nav
        className="activities-view__status-tabs"
        aria-label="Status das atividades"
      >
        {(Object.keys(statusLabels) as ActivityStatus[]).map((option) => (
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

      {loading ? (
        <p className="activities-view__status">Carregando atividades...</p>
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
