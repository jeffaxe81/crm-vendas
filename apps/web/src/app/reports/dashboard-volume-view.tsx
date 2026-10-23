"use client";

import {
  DashboardCatalogSchema,
  DashboardVolumeSchema,
  type DashboardMetricId,
  type DashboardVolume,
} from "@axes/contracts";
import { useEffect, useRef, useState } from "react";

import {
  compareDashboardVolumes,
  downloadDashboardVolumeCsv,
  type DashboardComparison,
} from "./dashboard-volume-insights";

import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

const metricCountKeys: Record<
  DashboardMetricId,
  keyof DashboardVolume["counts"]
> = {
  "crm.companies.active": "companies",
  "crm.contacts.active": "contacts",
  "crm.opportunities.active": "opportunities",
  "crm.activities.active": "activities",
};

type VolumeState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      catalog: ReturnType<typeof DashboardCatalogSchema.parse>;
      volume: DashboardVolume;
      comparison: DashboardComparison | null;
    };

/**
 * A token change fully remounts the panel, preventing another tenant's
 * previous snapshot from appearing even for a single React render.
 */
export function DashboardVolumeView({
  accessToken,
  refreshVersion = 0,
}: {
  accessToken: string;
  refreshVersion?: number;
}) {
  return (
    <TenantDashboardVolume
      key={accessToken}
      accessToken={accessToken}
      refreshVersion={refreshVersion}
    />
  );
}

function TenantDashboardVolume({
  accessToken,
  refreshVersion,
}: {
  accessToken: string;
  refreshVersion: number;
}) {
  const { locale, t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<VolumeState>({ status: "loading" });
  const lastSuccessful = useRef<DashboardVolume | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    void Promise.all([
      apiRequest<unknown>("/dashboards/catalog", {
        accessToken,
        cache: "no-store",
      }),
      apiRequest<unknown>("/dashboards/volume", {
        accessToken,
        cache: "no-store",
      }),
    ])
      .then(([catalog, volume]) => {
        const parsedCatalog = DashboardCatalogSchema.parse(catalog);
        const parsedVolume = DashboardVolumeSchema.parse(volume);
        if (!active) return;
        const total = Object.values(parsedVolume.counts).reduce(
          (sum, value) => sum + value,
          0
        );
        if (parsedVolume.totalActiveRecords !== total) {
          throw new Error("A API retornou totais inconsistentes.");
        }
        const previous = lastSuccessful.current;
        const comparison = previous
          ? compareDashboardVolumes(previous, parsedVolume)
          : null;
        lastSuccessful.current = parsedVolume;
        setState({
          status: "ready",
          catalog: parsedCatalog,
          volume: parsedVolume,
          comparison,
        });
      })
      .catch(cause => {
        if (active) {
          lastSuccessful.current = null;
          setState({
            status: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar o volume do CRM.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshVersion, revision]);

  return (
    <section className="sales-report" aria-labelledby="dashboard-volume-title">
      <h2 id="dashboard-volume-title">{t("Volume de registros do CRM")}</h2>
      <p className="activities-view__status">
        {t(
          "Contagem de registros ativos apenas da organização autenticada. Os alertas são informativos; não bloqueiam cadastros e não representam limite de armazenamento."
        )}
      </p>
      <button
        type="button"
        disabled={state.status === "loading"}
        onClick={() => setRevision(value => value + 1)}
      >
        {t("Atualizar volume")}
      </button>
      {state.status === "loading" ? (
        <p role="status">{t("Consultando volume de registros...")}</p>
      ) : state.status === "error" ? (
        <p role="alert" className="activities-view__error">
          {t(state.message)}
        </p>
      ) : (
        <>
          <p className="activities-view__status">
            {t("Atualizado em ")}
            {new Date(state.volume.asOf).toLocaleString(locale)}
          </p>
          <div
            className="companies-view__grid"
            aria-label={t("Contagens de registros por categoria")}
          >
            {state.catalog.metrics.map(metric => {
              const count = state.volume.counts[metricCountKeys[metric.id]];
              return (
                <article key={metric.id} className="companies-view__card">
                  <span>{t(metric.label)}</span>
                  <strong>{count.toLocaleString(locale)}</strong>
                </article>
              );
            })}
          </div>
          <p className="activities-view__status">
            {t("Total de registros ativos: ")}
            <strong>
              {state.volume.totalActiveRecords.toLocaleString(locale)}
            </strong>
          </p>
          <button
            type="button"
            onClick={() => downloadDashboardVolumeCsv(state.volume)}
          >
            {t("Exportar CSV de indicadores")}
          </button>
          {state.comparison ? (
            <section
              aria-label={t("Comparação com a última consulta da sessão")}
            >
              <h3>{t("Variação desde a consulta anterior")}</h3>
              <p className="activities-view__status">
                {t("Variação total: ")}
                <strong>
                  {state.comparison.totalDelta > 0 ? "+" : ""}
                  {state.comparison.totalDelta.toLocaleString(locale)}
                </strong>
              </p>
              <ul>
                {state.catalog.metrics.map(metric => {
                  const delta =
                    state.comparison!.delta[metricCountKeys[metric.id]];
                  return (
                    <li key={metric.id}>
                      {t(metric.label)}: {delta > 0 ? "+" : ""}
                      {delta.toLocaleString(locale)}
                    </li>
                  );
                })}
              </ul>
              <p className="activities-view__status">
                {t(
                  "Comparação apenas entre consultas desta sessão; não constitui série histórica."
                )}
              </p>
            </section>
          ) : null}
          {state.volume.level !== "normal" ? (
            <p role="status" className="activities-view__status">
              {state.volume.level === "critical"
                ? t("Atenção: volume acima do limiar crítico de observação.")
                : t("Atenção: volume acima do limiar de observação.")}
            </p>
          ) : null}
          <p className="activities-view__status">
            {t("Limiar de atenção: ")}
            {state.volume.thresholds.warning.toLocaleString(locale)}
            {t(" registros. Limiar crítico: ")}
            {state.volume.thresholds.critical.toLocaleString(locale)}
            {t(" registros.")}
          </p>
          {state.volume.totalActiveRecords === 0 ? (
            <p role="status">
              {t("Esta organização ainda não possui registros ativos.")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
