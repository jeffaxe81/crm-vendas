"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";

type Pipeline = { id: string; name: string };
type Health = {
  totalOpenOpportunities: number;
  openValue: string;
  winRate: string | null;
  stageConcentration: {
    stageName: string | null;
    percentage: number;
    exceeded: boolean;
  };
};
type Aging = {
  stages: Array<{
    stageId: string;
    name?: string;
    opportunities: number;
    averageDays: number;
    oldestDays: number;
  }>;
};
type Risk = {
  risks: Array<{
    opportunityId: string;
    title: string;
    severity: string;
    daysWithoutActivity: number;
    daysWithoutUpdate: number;
    signals: string[];
  }>;
  evaluated: number;
  truncated: boolean;
};

export function PipelineAnalyticsView({
  accessToken,
}: {
  accessToken: string;
}) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [aging, setAging] = useState<Aging | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPipelines([]);
    setPipelineId("");
    setHealth(null);
    setAging(null);
    setRisk(null);
    void apiRequest<Pipeline[]>("/pipelines", { accessToken })
      .then(items => {
        if (!active) return;
        setPipelines(items);
        // A seleção anterior pode pertencer a outra organização.
        setPipelineId(items[0]?.id ?? "");
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Falha ao carregar os funis."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!pipelineId) return;
    let active = true;
    setLoading(true);
    setError("");
    setHealth(null);
    setAging(null);
    setRisk(null);
    const parameter = `pipelineId=${encodeURIComponent(pipelineId)}`;
    void Promise.all([
      apiRequest<Health>(`/reports/pipeline-health?${parameter}`, {
        accessToken,
      }),
      apiRequest<Aging>(`/reports/opportunity-aging?${parameter}`, {
        accessToken,
      }),
      apiRequest<Risk>(`/reports/commercial-risks?${parameter}`, {
        accessToken,
      }),
    ])
      .then(([healthReport, agingReport, riskReport]) => {
        if (!active) return;
        setHealth(healthReport);
        setAging(agingReport);
        setRisk(riskReport);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Falha ao consultar os indicadores."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, pipelineId]);

  return (
    <section
      className="sales-report"
      aria-labelledby="pipeline-analytics-title"
    >
      <h2 id="pipeline-analytics-title">Saúde comercial · Ciclo 6</h2>
      <p className="activities-view__status">
        Indicadores descritivos do funil, sem previsão por inteligência
        artificial. A idade é calculada desde a criação das oportunidades.
      </p>
      <label>
        <span>Funil comercial </span>
        <select
          value={pipelineId}
          onChange={event => setPipelineId(event.target.value)}
        >
          {pipelines.map(pipeline => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </option>
          ))}
        </select>
      </label>
      {loading ? <p role="status">Carregando indicadores...</p> : null}
      {error ? (
        <p role="alert" className="activities-view__error">
          {error}
        </p>
      ) : null}
      {!loading && !error && pipelines.length === 0 ? (
        <p>Nenhum funil disponível.</p>
      ) : null}
      {!loading && health && aging && risk ? (
        <>
          <div
            className="companies-view__grid"
            aria-label="Indicadores de saúde"
          >
            <article className="companies-view__card">
              <span>Oportunidades abertas</span>
              <strong>{health.totalOpenOpportunities}</strong>
            </article>
            <article className="companies-view__card">
              <span>Valor em aberto</span>
              <strong>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(Number(health.openValue))}
              </strong>
            </article>
            <article className="companies-view__card">
              <span>Concentração na etapa</span>
              <strong>
                {health.stageConcentration.percentage.toLocaleString("pt-BR")}%
              </strong>
              <span>
                {health.stageConcentration.stageName ?? "Sem oportunidades"}
                {health.stageConcentration.exceeded
                  ? " · Acima do limite de 50%"
                  : ""}
              </span>
            </article>
            <article className="companies-view__card">
              <span>Oportunidades com sinais de risco</span>
              <strong>{risk.risks.length}</strong>
              <span>De {risk.evaluated} oportunidades avaliadas</span>
            </article>
          </div>
          <h3>Idade das oportunidades por etapa</h3>
          {aging.stages.length ? (
            <div className="sales-report__table">
              <table>
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th>Oportunidades</th>
                    <th>Idade média (dias)</th>
                    <th>Mais antiga (dias)</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.stages.map(stage => (
                    <tr key={stage.stageId}>
                      <td>{stage.name ?? stage.stageId}</td>
                      <td>{stage.opportunities}</td>
                      <td>{stage.averageDays.toLocaleString("pt-BR")}</td>
                      <td>{stage.oldestDays.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhuma oportunidade aberta.</p>
          )}
          <h3>Sinais de risco comercial</h3>
          {risk.truncated ? (
            <p role="status">
              Exibindo uma amostra de até 200 oportunidades. O resultado não
              representa todo o funil.
            </p>
          ) : null}
          {risk.risks.length ? (
            <div className="sales-report__table">
              <table>
                <thead>
                  <tr>
                    <th>Oportunidade</th>
                    <th>Gravidade</th>
                    <th>Sem atividade (dias)</th>
                    <th>Sem atualização (dias)</th>
                  </tr>
                </thead>
                <tbody>
                  {risk.risks.map(item => (
                    <tr key={item.opportunityId}>
                      <td>{item.title}</td>
                      <td>{item.severity === "HIGH" ? "Alta" : "Média"}</td>
                      <td>{item.daysWithoutActivity}</td>
                      <td>{item.daysWithoutUpdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhum sinal de risco identificado na amostra.</p>
          )}
          <p className="activities-view__status">
            Atividade registrada no CRM não comprova contato efetivo com o
            cliente. Os riscos apresentados não são notificações automáticas.
          </p>
        </>
      ) : null}
    </section>
  );
}
