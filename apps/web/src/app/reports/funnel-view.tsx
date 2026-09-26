"use client";

import {
  FunnelReportSchema,
  type FunnelReport,
  type FunnelStageKind,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { periodBoundary } from "./sales-by-product-view";

type FunnelViewProps = {
  accessToken: string;
};

type PipelineOption = {
  id: string;
  name: string;
};

type Period = { from: string; to: string };

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const stageKindLabels: Record<FunnelStageKind, string> = {
  OPEN: "Em aberto",
  WON: "Ganho",
  LOST: "Perdido",
};

function formatCurrency(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return currencyFormatter.format(Number(value)).replace(/[  ]/g, " ");
}

function formatPercent(value: string | null): string {
  return value === null ? "—" : `${percentFormatter.format(Number(value))}%`;
}

export function funnelPath(pipelineId: string, period: Period): string {
  const params = new URLSearchParams({ pipelineId });
  if (period.from) {
    params.set("from", periodBoundary(period.from, "start"));
  }
  if (period.to) {
    params.set("to", periodBoundary(period.to, "end"));
  }
  return `/reports/funnel?${params.toString()}`;
}

/** Largura da barra proporcional à maior quantidade entre as etapas. */
export function barWidth(opportunities: number, max: number): string {
  if (max <= 0 || opportunities <= 0) {
    return "0%";
  }
  return `${Math.max(2, Math.round((opportunities / max) * 100))}%`;
}

export function FunnelView({ accessToken }: FunnelViewProps) {
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);
  const [pipelineId, setPipelineId] = useState("");
  const [draft, setDraft] = useState<Period>({ from: "", to: "" });
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [report, setReport] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPipelines() {
      setPipelinesLoading(true);
      try {
        const result = await apiRequest<PipelineOption[]>("/pipelines", {
          accessToken,
        });
        if (active) {
          setPipelines(result);
          setPipelineId(current => current || result[0]?.id || "");
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os funis."
          );
        }
      } finally {
        if (active) {
          setPipelinesLoading(false);
        }
      }
    }

    void loadPipelines();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!pipelineId) {
      return;
    }
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(
          funnelPath(pipelineId, period),
          { accessToken }
        );
        const parsed = FunnelReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de funil."
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
  }, [accessToken, pipelineId, period]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setFilterError("");
    setPeriod({ ...draft });
  }

  function clearFilters() {
    setFilterError("");
    setDraft({ from: "", to: "" });
    setPeriod({ from: "", to: "" });
  }

  const maxOpportunities = report
    ? Math.max(0, ...report.stages.map(stage => stage.opportunities))
    : 0;

  return (
    <section className="sales-report" aria-labelledby="funnel-report-title">
      <h2 id="funnel-report-title">Funil e conversão</h2>
      <p className="activities-view__status">
        Oportunidades de cada etapa ativa do funil, na etapa em que estão hoje.
        O período considera a data de criação da oportunidade.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros do funil"
        onSubmit={applyFilters}
      >
        <label>
          <span>Funil</span>
          <select
            value={pipelineId}
            disabled={pipelinesLoading || pipelines.length === 0}
            onChange={event => setPipelineId(event.target.value)}
          >
            {pipelines.map(pipeline => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </label>
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

      {pipelinesLoading ? (
        <p className="activities-view__status">Carregando funis...</p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : pipelines.length === 0 ? (
        <p className="activities-view__status">
          Nenhum funil ativo encontrado.
        </p>
      ) : loading || !report ? (
        <p className="activities-view__status">Carregando funil...</p>
      ) : (
        <>
          <div
            className="companies-view__grid"
            aria-label="Indicadores de conversão"
          >
            <article className="companies-view__card">
              <span>Taxa de ganho</span>
              <strong>{formatPercent(report.indicators.winRate)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Valor ganho</span>
              <strong>{formatCurrency(report.indicators.wonValue)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Valor perdido</span>
              <strong>{formatCurrency(report.indicators.lostValue)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Valor em aberto</span>
              <strong>{formatCurrency(report.indicators.openValue)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Ticket médio ganho</span>
              <strong>
                {formatCurrency(report.indicators.averageWonTicket)}
              </strong>
            </article>
          </div>

          {report.stages.length === 0 ? (
            <p className="activities-view__status">
              Este funil não tem etapas ativas.
            </p>
          ) : (
            <div className="sales-report__table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Etapa</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Oportunidades</th>
                    <th scope="col">Valor estimado</th>
                    <th scope="col">Distribuição</th>
                  </tr>
                </thead>
                <tbody>
                  {report.stages.map(stage => (
                    <tr key={stage.stageId}>
                      <th scope="row">{stage.name}</th>
                      <td>{stageKindLabels[stage.kind]}</td>
                      <td>{stage.opportunities}</td>
                      <td>{formatCurrency(stage.value)}</td>
                      <td>
                        <span
                          className={`funnel-report__bar funnel-report__bar--${stage.kind.toLowerCase()}`}
                          data-testid="funnel-bar"
                          style={{
                            width: barWidth(
                              stage.opportunities,
                              maxOpportunities
                            ),
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td>{report.totals.opportunities}</td>
                    <td>{formatCurrency(report.totals.value)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {report.inactiveStages.opportunities > 0 ? (
            <p className="activities-view__status">
              O total inclui {report.inactiveStages.opportunities}{" "}
              {report.inactiveStages.opportunities === 1
                ? "oportunidade"
                : "oportunidades"}{" "}
              em etapas desativadas (
              {formatCurrency(report.inactiveStages.value)}).
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
