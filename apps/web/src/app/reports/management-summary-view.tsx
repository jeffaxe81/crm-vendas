"use client";

import {
  ManagementSummarySchema,
  type ManagementSummary,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { useWorkspace } from "../workspace/workspace-provider";
import { DashboardWidgets } from "./dashboard-widgets";
import { DashboardVolumeView } from "./dashboard-volume-view";
import { apiRequest } from "../../lib/api-client";
import { SalesByOwnerView } from "./sales-by-owner-view";
import { SalesByProductView } from "./sales-by-product-view";
import { ActivitiesByOwnerView } from "./activities-by-owner-view";
import { FunnelView } from "./funnel-view";
import { PipelineAnalyticsView } from "./pipeline-analytics-view";
import { SalesByMonthView } from "./sales-by-month-view";
import { CsatView } from "./csat-view";
import { SlaReportView } from "./sla-report-view";
import { useTranslation } from "../../i18n/language-provider";

export type ReportTab =
  | "volume"
  | "summary"
  | "sales-by-product"
  | "sales-by-owner"
  | "sales-by-month"
  | "funnel"
  | "pipeline-analytics"
  | "activities-by-owner"
  | "sla"
  | "csat";

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "summary", label: "Indicadores" },
  { id: "volume", label: "Volume de dados" },
  { id: "sales-by-product", label: "Vendas por produto" },
  { id: "sales-by-owner", label: "Vendas por vendedor" },
  { id: "sales-by-month", label: "Vendas por período" },
  { id: "funnel", label: "Funil" },
  { id: "pipeline-analytics", label: "Saúde comercial" },
  { id: "activities-by-owner", label: "Atividades" },
  { id: "sla", label: "SLA" },
  { id: "csat", label: "Satisfação" },
];

type ManagementSummaryViewProps = {
  accessToken: string;
  preferenceScope?: string;
  initialTab?: ReportTab;
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function ManagementSummaryView({
  accessToken,
  preferenceScope,
  initialTab = "summary",
}: ManagementSummaryViewProps) {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [summary, setSummary] = useState<ManagementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ReportTab>(initialTab);

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
          <p className="activities-view__eyebrow">{t("Visão executiva")}</p>
          <h1 id="management-summary-title">{t("Resumo gerencial")}</h1>
          <p>
            {t(
              "Indicadores consolidados do funil comercial e das atividades da organização."
            )}
          </p>
        </div>
      </header>

      <button
        type="button"
        disabled={loading}
        onClick={() => setRefreshVersion(value => value + 1)}
      >
        {t("Atualizar painel")}
      </button>

      <div
        className="activities-view__status-tabs"
        role="tablist"
        aria-label={t("Relatórios")}
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
            {t(option.label)}
          </button>
        ))}
      </div>

      {tab === "volume" ? (
        <div
          role="tabpanel"
          id="report-panel-volume"
          aria-labelledby="report-tab-volume"
        >
          <DashboardVolumeView
            accessToken={accessToken}
            refreshVersion={refreshVersion}
          />
        </div>
      ) : tab === "sales-by-product" ? (
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
      ) : tab === "pipeline-analytics" ? (
        <div
          role="tabpanel"
          id="report-panel-pipeline-analytics"
          aria-labelledby="report-tab-pipeline-analytics"
        >
          <PipelineAnalyticsView accessToken={accessToken} />
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
          {t("Carregando resumo gerencial...")}
        </p>
      ) : error && !summary ? (
        <p className="login-form__error" role="alert">
          {t(error)}
        </p>
      ) : summary ? (
        <>
          {loading ? <p role="status">{t("Atualizando painel...")}</p> : null}
          {error ? (
            <p role="alert">
              {t(error)}
              {t(
                ". Exibindo o último resumo carregado; tente Atualizar painel novamente."
              )}
            </p>
          ) : null}
          <p className="activities-view__status">
            {t("Atualizado em ")}
            {dateTimeFormatter.format(new Date(summary.asOf))}
          </p>

          {workspace ? (
            <div>
              {workspace.error ? <p role="alert">{workspace.error}</p> : null}
              {workspace.message ? (
                <p role="status">{workspace.message}</p>
              ) : null}
              <button
                type="button"
                disabled={workspace.loading || workspace.saving}
                onClick={() => void workspace.save()}
              >
                {t("Salvar preferências")}
              </button>
            </div>
          ) : null}
          <DashboardWidgets
            key={preferenceScope ?? "session"}
            summary={summary}
            accessToken={accessToken}
            preferenceScope={preferenceScope}
            refreshVersion={refreshVersion}
            onOpenReport={setTab}
            customizationDisabled={
              workspace ? workspace.loading || workspace.saving : false
            }
            controlledLayout={
              workspace
                ? {
                    order: workspace.draft.dashboardOrder,
                    hidden: workspace.draft.dashboardHidden,
                  }
                : undefined
            }
            onLayoutChange={
              workspace
                ? next =>
                    workspace.setDraft({
                      ...workspace.draft,
                      dashboardOrder: next.order,
                      dashboardHidden: next.hidden,
                    })
                : undefined
            }
          />
        </>
      ) : null}
    </section>
  );
}
