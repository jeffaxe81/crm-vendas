"use client";

import {
  ManagementSummarySchema,
  type ManagementSummary,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { SalesByProductView } from "./sales-by-product-view";
import { ActivitiesByOwnerView } from "./activities-by-owner-view";
import { FunnelView } from "./funnel-view";
import { CsatView } from "./csat-view";
import { SlaReportView } from "./sla-report-view";

type ReportTab =
  | "summary"
  | "sales-by-product"
  | "funnel"
  | "activities-by-owner"
  | "sla"
  | "csat";

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "summary", label: "Indicadores" },
  { id: "sales-by-product", label: "Vendas por produto" },
  { id: "funnel", label: "Funil" },
  { id: "activities-by-owner", label: "Atividades" },
  { id: "sla", label: "SLA" },
  { id: "csat", label: "Satisfação" },
];

type ManagementSummaryViewProps = {
  accessToken: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatCurrency(value: string): string {
  return currencyFormatter
    .format(Number(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

export function ManagementSummaryView({
  accessToken,
}: ManagementSummaryViewProps) {
  const [summary, setSummary] = useState<ManagementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ReportTab>("summary");

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(
          "/reports/management-summary",
          { accessToken }
        );
        const parsed = ManagementSummarySchema.parse(payload);
        if (active) {
          setSummary(parsed);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o resumo gerencial."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [accessToken]);

  return (
    <section
      className="activities-view"
      aria-labelledby="management-summary-title"
    >
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Visão executiva</p>
          <h1 id="management-summary-title">Resumo gerencial</h1>
          <p>
            Indicadores consolidados do funil comercial e das atividades da
            organização.
          </p>
        </div>
      </header>

      <div
        className="activities-view__status-tabs"
        role="tablist"
        aria-label="Relatórios"
      >
        {reportTabs.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`report-tab-${option.id}`}
            aria-selected={tab === option.id}
            className={tab === option.id ? "is-active" : undefined}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "sales-by-product" ? (
        <div
          role="tabpanel"
          id="report-panel-sales-by-product"
          aria-labelledby="report-tab-sales-by-product"
        >
          <SalesByProductView accessToken={accessToken} />
        </div>
      ) : tab === "funnel" ? (
        <div
          role="tabpanel"
          id="report-panel-funnel"
          aria-labelledby="report-tab-funnel"
        >
          <FunnelView accessToken={accessToken} />
        </div>
      ) : tab === "activities-by-owner" ? (
        <div
          role="tabpanel"
          id="report-panel-activities-by-owner"
          aria-labelledby="report-tab-activities-by-owner"
        >
          <ActivitiesByOwnerView accessToken={accessToken} />
        </div>
      ) : tab === "sla" ? (
        <div
          role="tabpanel"
          id="report-panel-sla"
          aria-labelledby="report-tab-sla"
        >
          <SlaReportView accessToken={accessToken} />
        </div>
      ) : tab === "csat" ? (
        <div
          role="tabpanel"
          id="report-panel-csat"
          aria-labelledby="report-tab-csat"
        >
          <CsatView accessToken={accessToken} />
        </div>
      ) : loading ? (
        <p className="activities-view__status">
          Carregando resumo gerencial...
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : summary ? (
        <>
          <p className="activities-view__status">
            Atualizado em {dateTimeFormatter.format(new Date(summary.asOf))}
          </p>

          <div
            className="companies-view__grid"
            aria-label="Indicadores gerenciais"
          >
            <article className="companies-view__card">
              <span>Valor em aberto</span>
              <strong>{formatCurrency(summary.openEstimatedValue)}</strong>
            </article>
            <article className="companies-view__card">
              <span>Atividades pendentes</span>
              <strong>{summary.pendingActivities}</strong>
            </article>
            <article className="companies-view__card">
              <span>Atividades atrasadas</span>
              <strong>{summary.overdueActivities}</strong>
            </article>
            <article className="companies-view__card">
              <span>Atividades sem data</span>
              <strong>{summary.undatedActivities}</strong>
            </article>
          </div>

          <section aria-labelledby="management-summary-pipeline-title">
            <h2 id="management-summary-pipeline-title">
              Oportunidades por etapa
            </h2>
            {summary.opportunitiesByStage.length === 0 ? (
              <p className="activities-view__status">
                Nenhuma oportunidade ativa encontrada.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Funil</th>
                    <th scope="col">Etapa</th>
                    <th scope="col">Oportunidades</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.opportunitiesByStage.map(item => (
                    <tr key={`${item.pipelineId}:${item.stageId}`}>
                      <td>{item.pipelineName}</td>
                      <td>{item.stageName}</td>
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
