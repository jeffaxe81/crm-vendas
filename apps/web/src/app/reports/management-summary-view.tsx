"use client";

import {
  ManagementSummarySchema,
  type ManagementSummary,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { DashboardWidgets } from "./dashboard-widgets";
import { apiRequest } from "../../lib/api-client";
import { SalesByOwnerView } from "./sales-by-owner-view";
import { SalesByProductView } from "./sales-by-product-view";
import { ActivitiesByOwnerView } from "./activities-by-owner-view";
import { FunnelView } from "./funnel-view";
import { SalesByMonthView } from "./sales-by-month-view";
import { CsatView } from "./csat-view";
import { SlaReportView } from "./sla-report-view";

type ReportTab =
  | "summary"
  | "sales-by-product"
  | "sales-by-owner"
  | "sales-by-month"
  | "funnel"
  | "activities-by-owner"
  | "sla"
  | "csat";

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "summary", label: "Indicadores" },
  { id: "sales-by-product", label: "Vendas por produto" },
  { id: "sales-by-owner", label: "Vendas por vendedor" },
  { id: "sales-by-month", label: "Vendas por período" },
  { id: "funnel", label: "Funil" },
  { id: "activities-by-owner", label: "Atividades" },
  { id: "sla", label: "SLA" },
  { id: "csat", label: "Satisfação" },
];

type ManagementSummaryViewProps = {
  accessToken: string;
  preferenceScope?: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function ManagementSummaryView({
  accessToken,
  preferenceScope,
}: ManagementSummaryViewProps) {
  const [refreshVersion, setRefreshVersion] = useState(0);
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
  }, [accessToken, refreshVersion]);

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

      <button
        type="button"
        disabled={loading}
        onClick={() => setRefreshVersion(value => value + 1)}
      >
        Atualizar painel
      </button>

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
      ) : tab === "sales-by-owner" ? (
        <div
          role="tabpanel"
          id="report-panel-sales-by-owner"
          aria-labelledby="report-tab-sales-by-owner"
        >
          <SalesByOwnerView accessToken={accessToken} />
        </div>
      ) : tab === "sales-by-month" ? (
        <div
          role="tabpanel"
          id="report-panel-sales-by-month"
          aria-labelledby="report-tab-sales-by-month"
        >
          <SalesByMonthView accessToken={accessToken} />
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
      ) : loading && !summary ? (
        <p className="activities-view__status">
          Carregando resumo gerencial...
        </p>
      ) : error && !summary ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : summary ? (
        <>
          {loading ? <p role="status">Atualizando painel...</p> : null}
          {error ? (
            <p role="alert">
              {error}. Exibindo o último resumo carregado; tente Atualizar
              painel novamente.
            </p>
          ) : null}
          <p className="activities-view__status">
            Atualizado em {dateTimeFormatter.format(new Date(summary.asOf))}
          </p>

          <DashboardWidgets
            key={preferenceScope ?? "session"}
            summary={summary}
            accessToken={accessToken}
            preferenceScope={preferenceScope}
            refreshVersion={refreshVersion}
            onOpenReport={setTab}
          />
        </>
      ) : null}
    </section>
  );
}
