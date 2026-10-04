"use client";

import type { ManagementSummary } from "@axes/contracts";
import { useEffect, useState } from "react";
import { MonthlySalesChart } from "./monthly-sales-chart";

type ReportTarget = "funnel" | "activities-by-owner" | "sales-by-month";
const widgets = [
  { id: "value", label: "Valor em aberto", report: "funnel" },
  {
    id: "pending",
    label: "Atividades pendentes",
    report: "activities-by-owner",
  },
  {
    id: "overdue",
    label: "Atividades atrasadas",
    report: "activities-by-owner",
  },
  {
    id: "undated",
    label: "Atividades sem data",
    report: "activities-by-owner",
  },
  { id: "stages", label: "Oportunidades por etapa", report: "funnel" },
  { id: "sales", label: "Vendas ganhas por mês", report: "sales-by-month" },
] as const;
type WidgetId = (typeof widgets)[number]["id"];
type Layout = { order: WidgetId[]; hidden: WidgetId[] };
const defaults = (): Layout => ({
  order: widgets.map(widget => widget.id),
  hidden: [],
});
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
function currency(value: string) {
  return money.format(Number(value)).replace(/[\u00a0\u202f]/g, " ");
}

function validLayout(value: unknown): value is Layout {
  if (!value || typeof value !== "object") return false;
  const { order, hidden } = value as Partial<Layout>;
  const ids = widgets.map(widget => widget.id);
  return (
    Array.isArray(order) &&
    Array.isArray(hidden) &&
    order.length === ids.length &&
    new Set(order).size === ids.length &&
    order.every(id => ids.includes(id)) &&
    new Set(hidden).size === hidden.length &&
    hidden.every(id => ids.includes(id))
  );
}

export function DashboardWidgets({
  summary,
  accessToken,
  preferenceScope,
  refreshVersion,
  onOpenReport,
}: {
  summary: ManagementSummary;
  accessToken: string;
  preferenceScope?: string;
  refreshVersion: number;
  onOpenReport: (target: ReportTarget) => void;
}) {
  const [layout, setLayout] = useState<Layout>(defaults);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const storageKey = preferenceScope
    ? `crm:dashboard:v1:${preferenceScope}`
    : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "null"
      );
      if (validLayout(value)) setLayout(value);
    } catch {
      /* A missing or invalid preference keeps the default layout. */
    }
  }, [storageKey]);

  function update(next: Layout) {
    setLayout(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice("Preferências salvas neste navegador.");
    } catch {
      setNotice(
        "Preferências aplicadas nesta sessão; não foi possível salvar no navegador."
      );
    }
  }
  function move(id: WidgetId, direction: number) {
    const order = [...layout.order];
    const index = order.indexOf(id);
    const destination = index + direction;
    if (destination < 0 || destination >= order.length) return;
    [order[index], order[destination]] = [order[destination]!, order[index]!];
    update({ ...layout, order });
  }
  const metricValues = {
    value: currency(summary.openEstimatedValue),
    pending: summary.pendingActivities,
    overdue: summary.overdueActivities,
    undated: summary.undatedActivities,
  };
  const maxStages = Math.max(
    1,
    ...summary.opportunitiesByStage.map(stage => stage.count)
  );
  return (
    <>
      <button
        type="button"
        aria-expanded={editing}
        aria-controls="dashboard-settings"
        onClick={() => setEditing(value => !value)}
      >
        Personalizar painel
      </button>
      {editing ? (
        <section
          id="dashboard-settings"
          aria-label="Personalização do painel"
          className="dashboard-settings"
        >
          <p>
            Escolha os componentes e sua ordem. Preferências por usuário e
            organização neste navegador.
          </p>
          <ul>
            {layout.order.map((id, index) => {
              const widget = widgets.find(item => item.id === id)!;
              return (
                <li key={id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!layout.hidden.includes(id)}
                      onChange={() =>
                        update({
                          ...layout,
                          hidden: layout.hidden.includes(id)
                            ? layout.hidden.filter(value => value !== id)
                            : [...layout.hidden, id],
                        })
                      }
                    />
                    Exibir {widget.label}
                  </label>
                  <div>
                    <button
                      type="button"
                      aria-label={`Mover ${widget.label} para cima`}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${widget.label} para baixo`}
                      disabled={index === layout.order.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => update(defaults())}>
            Restaurar padrão
          </button>
        </section>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <div className="dashboard-widgets" aria-label="Componentes do dashboard">
        {layout.order
          .filter(id => !layout.hidden.includes(id))
          .map(id => {
            const widget = widgets.find(item => item.id === id)!;
            return (
              <article
                key={id}
                className={`companies-view__card dashboard-widget ${id === "sales" || id === "stages" ? "dashboard-widget--wide" : ""}`}
                aria-label={widget.label}
              >
                {id === "sales" ? (
                  <MonthlySalesChart
                    accessToken={accessToken}
                    refreshVersion={refreshVersion}
                  />
                ) : id === "stages" ? (
                  <>
                    <h2>Oportunidades por etapa</h2>
                    <p>
                      Distribuição atual por funil e etapa; não representa taxa
                      de conversão.
                    </p>
                    {summary.opportunitiesByStage.length === 0 ? (
                      <p>Nenhuma oportunidade ativa encontrada.</p>
                    ) : (
                      <ul className="dashboard-bars">
                        {summary.opportunitiesByStage.map(stage => (
                          <li key={`${stage.pipelineId}:${stage.stageId}`}>
                            <span>
                              {stage.pipelineName} ·{" "}
                              <span>{stage.stageName}</span>
                            </span>
                            <strong>{stage.count}</strong>
                            <meter
                              min={0}
                              max={maxStages}
                              value={stage.count}
                              aria-label={`${stage.pipelineName}, ${stage.stageName}: ${stage.count} oportunidades`}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <span>{widget.label}</span>
                    <strong className="dashboard-metric">
                      {metricValues[id]}
                    </strong>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Ver relatório de ${widget.label}`}
                  onClick={() => onOpenReport(widget.report)}
                >
                  Ver relatório
                </button>
              </article>
            );
          })}
      </div>
      {layout.hidden.length === widgets.length ? (
        <p>
          Nenhum componente selecionado. Use Personalizar painel para exibir
          indicadores.
        </p>
      ) : null}
    </>
  );
}
