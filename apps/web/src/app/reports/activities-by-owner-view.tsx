"use client";

import {
  ActivitiesByOwnerReportSchema,
  type ActivitiesByOwnerCounts,
  type ActivitiesByOwnerReport,
  type ActivityType,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { periodBoundary } from "./sales-by-product-view";
import { useTranslation } from "../../i18n/language-provider";

type ActivitiesByOwnerViewProps = {
  accessToken: string;
};

type Filters = { from: string; to: string; type: "" | ActivityType };

const emptyFilters: Filters = { from: "", to: "", type: "" };

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatCompletionRate(rate: number | null): string {
  return rate === null
    ? "—"
    : percentFormatter.format(rate).replace(/[  ]/g, " ");
}

export function activitiesByOwnerPath(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) {
    params.set("from", periodBoundary(filters.from, "start"));
  }
  if (filters.to) {
    params.set("to", periodBoundary(filters.to, "end"));
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  const query = params.toString();
  return `/reports/activities-by-owner${query ? `?${query}` : ""}`;
}

function CountCells({ counts }: { counts: ActivitiesByOwnerCounts }) {
  const { t } = useTranslation();
  return (
    <>
      <td>{counts.total}</td>
      <td>{counts.completed}</td>
      <td>{counts.pending}</td>
      <td
        className={
          counts.overdue > 0 ? "activities-report__overdue" : undefined
        }
      >
        {counts.overdue > 0 ? (
          <strong>
            {counts.overdue}
            <span className="activities-report__badge">{t("atrasadas")}</span>
          </strong>
        ) : (
          counts.overdue
        )}
      </td>
      <td>{counts.completedOnTime}</td>
      <td>{formatCompletionRate(counts.completionRate)}</td>
      <td>
        {counts.byType.TASK} / {counts.byType.APPOINTMENT}
      </td>
    </>
  );
}

export function ActivitiesByOwnerView({
  accessToken,
}: ActivitiesByOwnerViewProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [report, setReport] = useState<ActivitiesByOwnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(
          activitiesByOwnerPath(filters),
          { accessToken }
        );
        const parsed = ActivitiesByOwnerReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de atividades."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      active = false;
    };
  }, [accessToken, filters]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setFilterError("");
    setFilters({ ...draft });
  }

  function clearFilters() {
    setFilterError("");
    setDraft(emptyFilters);
    setFilters(emptyFilters);
  }

  return (
    <section
      className="sales-report"
      aria-labelledby="activities-by-owner-title"
    >
      <h2 id="activities-by-owner-title">{t("Atividades por responsável")}</h2>
      <p className="activities-view__status">
        {t(
          "Produtividade comercial por responsável. O período considera o prazo da atividade; com período informado, atividades sem prazo ficam de fora."
        )}
      </p>

      <form
        className="sales-report__filters"
        aria-label={t("Filtros de atividades por responsável")}
        onSubmit={applyFilters}
      >
        <label>
          <span>{t("De")}</span>
          <input
            type="date"
            value={draft.from}
            onChange={event =>
              setDraft(current => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label>
          <span>{t("Até")}</span>
          <input
            type="date"
            value={draft.to}
            onChange={event =>
              setDraft(current => ({ ...current, to: event.target.value }))
            }
          />
        </label>
        <label>
          <span>{t("Tipo")}</span>
          <select
            value={draft.type}
            onChange={event =>
              setDraft(current => ({
                ...current,
                type: event.target.value as Filters["type"],
              }))
            }
          >
            <option value="">{t("Todos")}</option>
            <option value="TASK">{t("Tarefa")}</option>
            <option value="APPOINTMENT">{t("Compromisso")}</option>
          </select>
        </label>
        <button type="submit">{t("Aplicar")}</button>
        <button type="button" onClick={clearFilters}>
          {t("Limpar")}
        </button>
      </form>
      {filterError ? (
        <p className="activities-view__error" role="alert">
          {filterError}
        </p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">
          {t("Carregando atividades por responsável...")}
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {t(error)}
        </p>
      ) : report && report.items.length === 0 ? (
        <p className="activities-view__status">
          {t("Nenhuma atividade encontrada no período.")}
        </p>
      ) : report ? (
        <div className="sales-report__table">
          <table>
            <thead>
              <tr>
                <th scope="col">{t("Responsável")}</th>
                <th scope="col">{t("Total")}</th>
                <th scope="col">{t("Concluídas")}</th>
                <th scope="col">{t("Pendentes")}</th>
                <th scope="col">{t("Atrasadas")}</th>
                <th scope="col">{t("No prazo")}</th>
                <th scope="col">{t("Taxa de conclusão")}</th>
                <th scope="col">{t("Tarefas / Compromissos")}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map(item => (
                <tr
                  key={item.ownerUserId}
                  className={
                    item.overdue > 0
                      ? "activities-report__row--overdue"
                      : undefined
                  }
                >
                  <th scope="row">
                    {item.ownerDisplayName}
                    {!item.ownerActive ? (
                      <small>{t(" (inativo)")}</small>
                    ) : null}
                  </th>
                  <CountCells counts={item} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("Total geral")}</th>
                <CountCells counts={report.totals} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
