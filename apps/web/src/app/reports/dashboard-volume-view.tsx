"use client";

import {
  DashboardCatalogSchema,
  DashboardVolumeSchema,
  type DashboardMetricId,
  type DashboardVolume,
} from "@axes/contracts";
import { useEffect, useState } from "react";

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
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<VolumeState>({ status: "loading" });

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
        if (
          parsedVolume.totalActiveRecords !==
          Object.values(parsedVolume.counts).reduce(
            (sum, value) => sum + value,
            0
          )
        ) {
          throw new Error("A API retornou totais inconsistentes.");
        }
        setState({
          status: "ready",
          catalog: parsedCatalog,
          volume: parsedVolume,
        });
      })
      .catch(cause => {
        if (active) {
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
    <section
      className="sales-report"
      aria-labelledby="dashboard-volume-title"
    >
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
            {new Date(state.volume.asOf).toLocaleString("pt-BR")}
          </p>
          <div
            className="companies-view__grid"
            aria-label={t("Contagens de registros por categoria")}
          >
            {state.catalog.metrics.map(metric => (
              <article key={metric.id} className="companies-view__card">
                <span>{t(metric.label)}</span>
                <strong>
                  {state.volume.counts[
                    metricCountKeys[metric.id]
                  ].toLocaleString("pt-BR")}
                </strong>
              </article>
            ))}
          </div>
          <p className="activities-view__status">
            {t("Total de registros ativos: ")}
            <strong>
              {state.volume.totalActiveRecords.toLocaleString("pt-BR")}
            </strong>
          </p>
          {state.volume.level !== "normal" ? (
            <p role="status" className="activities-view__status">
              {state.volume.level === "critical"
                ? t("Atenção: volume acima do limiar crítico de observação.")
                : t("Atenção: volume acima do limiar de observação.")}
            </p>
          ) : null}
          <p className="activities-view__status">
            {t("Limiar de atenção: ")}
            {state.volume.thresholds.warning.toLocaleString("pt-BR")}
            {t(" registros. Limiar crítico: ")}
            {state.volume.thresholds.critical.toLocaleString("pt-BR")}
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
