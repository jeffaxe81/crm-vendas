"use client";

import {
  SlaReportSchema,
  type SlaReport,
  type SlaReportCounts,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { priorityLabels } from "../tickets/ticket-labels";
import { formatCompletionRate } from "./activities-by-owner-view";
import { periodBoundary } from "./sales-by-product-view";

type SlaReportViewProps = {
  accessToken: string;
};

type Filters = { from: string; to: string };

const emptyFilters: Filters = { from: "", to: "" };

export function slaReportPath(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) {
    params.set("from", periodBoundary(filters.from, "start"));
  }
  if (filters.to) {
    params.set("to", periodBoundary(filters.to, "end"));
  }
  const query = params.toString();
  return `/reports/sla${query ? `?${query}` : ""}`;
}

function CountCells({ counts }: { counts: SlaReportCounts }) {
  return (
    <>
      <td>{counts.opened}</td>
      <td>
        {formatCompletionRate(counts.firstResponseRate)}
        <small>
          {" "}
          ({counts.firstResponseOnTime}/{counts.firstResponseEvaluated})
        </small>
      </td>
      <td>
        {formatCompletionRate(counts.resolutionRate)}
        <small>
          {" "}
          ({counts.resolutionOnTime}/{counts.resolutionEvaluated})
        </small>
      </td>
      <td
        className={
          counts.breachedOpen > 0 ? "activities-report__overdue" : undefined
        }
      >
        {counts.breachedOpen > 0 ? (
          <strong>
            {counts.breachedOpen}
            <span className="activities-report__badge">vencidas</span>
          </strong>
        ) : (
          counts.breachedOpen
        )}
      </td>
    </>
  );
}

/** C5.3 — relatório de SLA por prioridade (aba "SLA" do Resumo gerencial). */
export function SlaReportView({ accessToken }: SlaReportViewProps) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [report, setReport] = useState<SlaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");
      try {
        const payload = await apiRequest<unknown>(slaReportPath(filters), {
          accessToken,
        });
        const parsed = SlaReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de SLA."
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
    <section className="sales-report" aria-labelledby="sla-report-title">
      <h2 id="sla-report-title">SLA de atendimento</h2>
      <p className="activities-view__status">
        Cumprimento dos prazos por prioridade, para solicitações abertas no
        período. Os percentuais consideram prazos já cumpridos ou vencidos; a
        coluna de vencidas mostra as solicitações em aberto agora.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros do relatório de SLA"
        onSubmit={applyFilters}
      >
        <label>
          <span>De</span>
          <input
            type="date"
            value={draft.from}
            onChange={event =>
              setDraft(current => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Até</span>
          <input
            type="date"
            value={draft.to}
            onChange={event =>
              setDraft(current => ({ ...current, to: event.target.value }))
            }
          />
        </label>
        <button type="submit">Aplicar</button>
        <button type="button" onClick={clearFilters}>
          Limpar
        </button>
      </form>
      {filterError ? (
        <p className="activities-view__error" role="alert">
          {filterError}
        </p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">
          Carregando relatório de SLA...
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : report ? (
        <div className="sales-report__table">
          <table>
            <thead>
              <tr>
                <th scope="col">Prioridade</th>
                <th scope="col">Abertas no período</th>
                <th scope="col">1ª resposta no prazo</th>
                <th scope="col">Resolução no prazo</th>
                <th scope="col">Vencidas em aberto agora</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map(item => (
                <tr key={item.priority}>
                  <th scope="row">{priorityLabels[item.priority]}</th>
                  <CountCells counts={item} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total geral</th>
                <CountCells counts={report.totals} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
