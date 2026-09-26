"use client";

import { CsatReportSchema, type CsatReport } from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { periodBoundary } from "./sales-by-product-view";

type CsatViewProps = {
  accessToken: string;
};

type Filters = { from: string; to: string };

const emptyFilters: Filters = { from: "", to: "" };

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const averageFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

export function formatCsatPercent(value: number | null): string {
  return value === null
    ? "—"
    : percentFormatter.format(value).replace(/[  ]/g, " ");
}

export function formatCsatAverage(value: number | null): string {
  return value === null ? "—" : averageFormatter.format(value);
}

export function csatPath(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.from) {
    params.set("from", periodBoundary(filters.from, "start"));
  }
  if (filters.to) {
    params.set("to", periodBoundary(filters.to, "end"));
  }
  const query = params.toString();
  return `/reports/csat${query ? `?${query}` : ""}`;
}

const RATINGS = ["5", "4", "3", "2", "1"] as const;

/** C5.4 — aba "Satisfação" do Resumo gerencial. */
export function CsatView({ accessToken }: CsatViewProps) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [report, setReport] = useState<CsatReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiRequest<unknown>(csatPath(filters), { accessToken })
      .then(payload => {
        if (active) setReport(CsatReportSchema.parse(payload));
      })
      .catch(cause => {
        if (!active) return;
        setReport(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar o relatório de satisfação."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
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
    <section className="sales-report" aria-labelledby="csat-title">
      <h2 id="csat-title">Satisfação do atendimento</h2>
      <p className="activities-view__status">
        Pesquisas geradas na resolução das solicitações. O período considera a
        data da primeira resolução; CSAT é o percentual de notas 4 e 5 entre as
        respondidas.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros de satisfação"
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
        <p className="activities-view__status">Carregando satisfação...</p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : report && report.sent === 0 ? (
        <p className="activities-view__status">
          Nenhuma pesquisa de satisfação no período.
        </p>
      ) : report ? (
        <>
          <div
            className="companies-view__grid"
            aria-label="Indicadores de satisfação"
          >
            <article className="companies-view__card">
              <span>CSAT</span>
              <strong>{formatCsatPercent(report.csat)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Nota média</span>
              <strong>{formatCsatAverage(report.averageRating)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Enviadas</span>
              <strong>{report.sent}</strong>
            </article>
            <article className="companies-view__card">
              <span>Respondidas</span>
              <strong>{report.responded}</strong>
            </article>
            <article className="companies-view__card">
              <span>Taxa de resposta</span>
              <strong>{formatCsatPercent(report.responseRate)}</strong>
            </article>
          </div>

          <div className="sales-report__table">
            <table>
              <caption>Distribuição das notas</caption>
              <thead>
                <tr>
                  <th scope="col">Nota</th>
                  <th scope="col">Respostas</th>
                  <th scope="col">Participação</th>
                </tr>
              </thead>
              <tbody>
                {RATINGS.map(rating => (
                  <tr key={rating}>
                    <th scope="row">{rating}</th>
                    <td>{report.distribution[rating]}</td>
                    <td>
                      {formatCsatPercent(
                        report.responded === 0
                          ? null
                          : report.distribution[rating] / report.responded
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
