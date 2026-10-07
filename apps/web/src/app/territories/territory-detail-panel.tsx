"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type CoverageStatus = "UNCOVERED" | "PARTIAL" | "COVERED";

type CoverageTarget = {
  id: string;
  companyId: string;
  coverageStatus: CoverageStatus;
  company: { id: string; legalName: string };
};

type Quota = {
  id: string;
  period: "MONTH" | "QUARTER" | "YEAR";
  year: number;
  periodIndex?: number;
  amount: string;
  actual: string;
};

type Metrics = {
  coveragePercentage: string;
  quotaPercentage: string;
  actualRevenue: string;
  targetCount: number;
  coveredCount: number;
  quotaYear?: number | null;
  quotaPeriod?: Quota["period"] | null;
};

type CompanyOption = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type CompanyListResponse = {
  items: CompanyOption[];
  page: number;
  limit: number;
  total: number;
};

type TerritoryDetailPanelProps = {
  accessToken: string;
  territoryId: string;
  canWrite: boolean;
};

const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  UNCOVERED: "Não coberta",
  PARTIAL: "Parcial",
  COVERED: "Coberta",
};

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function quotaPeriodLabel(quota: Quota): string {
  const index = quota.periodIndex ?? 0;
  if (quota.period === "YEAR") return "Anual";
  if (quota.period === "MONTH") {
    return index >= 1 && index <= 12
      ? (MONTH_LABELS[index - 1] ?? "Mensal (legado)")
      : "Mensal (legado)";
  }
  return index >= 1 && index <= 4
    ? `${index}º trimestre`
    : "Trimestral (legado)";
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: string): string {
  return currencyFormatter
    .format(Number(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

export function TerritoryDetailPanel({
  accessToken,
  territoryId,
  canWrite,
}: TerritoryDetailPanelProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [coverage, setCoverage] = useState<CoverageTarget[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const [companyId, setCompanyId] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");

  const [quotaPeriod, setQuotaPeriod] = useState<Quota["period"]>("MONTH");
  const [quotaPeriodIndex, setQuotaPeriodIndex] = useState("1");
  const [quotaYear, setQuotaYear] = useState(
    String(new Date().getUTCFullYear())
  );
  const [quotaAmount, setQuotaAmount] = useState("");
  const [quotaActual, setQuotaActual] = useState("");
  const [quotaError, setQuotaError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [metricsResult, coverageResult, quotasResult] = await Promise.all(
          [
            apiRequest<Metrics>(`/territories/${territoryId}/metrics`, {
              accessToken,
            }),
            apiRequest<CoverageTarget[]>(
              `/territories/${territoryId}/coverage`,
              { accessToken }
            ),
            apiRequest<Quota[]>(`/territories/${territoryId}/quotas`, {
              accessToken,
            }),
          ]
        );
        if (active) {
          setMetrics(metricsResult);
          setCoverage(coverageResult);
          setQuotas(quotasResult);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os detalhes do território."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, territoryId, refresh]);

  async function searchCompanies() {
    setCoverageError("");
    setCompanyLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "50",
        sortBy: "legalName",
        sortOrder: "asc",
      });
      const query = companyQuery.trim();
      if (query) {
        params.set("q", query);
      }
      const result = await apiRequest<CompanyListResponse>(
        `/companies?${params.toString()}`,
        { accessToken }
      );
      const alreadyCovered = new Set(coverage.map(target => target.companyId));
      setCompanyOptions(
        result.items.filter(company => !alreadyCovered.has(company.id))
      );
    } catch (cause) {
      setCoverageError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível buscar as empresas disponíveis."
      );
    } finally {
      setCompanyLoading(false);
    }
  }

  async function addCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = companyId.trim();
    if (!id) {
      setCoverageError("Selecione uma empresa-alvo.");
      return;
    }
    setCoverageError("");
    try {
      await apiRequest(`/territories/${territoryId}/coverage/add`, {
        accessToken,
        method: "POST",
        body: { companyId: id },
      });
      setCompanyId("");
      setRefresh(current => current + 1);
    } catch (cause) {
      setCoverageError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível adicionar a empresa-alvo."
      );
    }
  }

  async function updateCoverageStatus(
    target: CoverageTarget,
    status: CoverageStatus
  ) {
    setCoverageError("");
    try {
      await apiRequest(
        `/territories/${territoryId}/coverage/${target.companyId}`,
        { accessToken, method: "PATCH", body: { coverageStatus: status } }
      );
      setRefresh(current => current + 1);
    } catch (cause) {
      setCoverageError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a cobertura."
      );
    }
  }

  async function removeCoverage(target: CoverageTarget) {
    setCoverageError("");
    try {
      await apiRequest(
        `/territories/${territoryId}/coverage/${target.companyId}`,
        { accessToken, method: "DELETE" }
      );
      setRefresh(current => current + 1);
    } catch (cause) {
      setCoverageError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover a empresa-alvo."
      );
    }
  }

  async function submitQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(quotaYear);
    const amount = quotaAmount.trim();
    const actual = quotaActual.trim();
    const periodIndex =
      quotaPeriod === "YEAR" ? undefined : Number(quotaPeriodIndex);

    if (!year || !amount) {
      setQuotaError("Informe ano e meta.");
      return;
    }

    if (
      quotaPeriod !== "YEAR" &&
      (!periodIndex ||
        (quotaPeriod === "MONTH" && periodIndex > 12) ||
        (quotaPeriod === "QUARTER" && periodIndex > 4))
    ) {
      setQuotaError("Informe o mês ou trimestre da cota.");
      return;
    }

    setQuotaError("");
    try {
      await apiRequest(`/territories/${territoryId}/quotas`, {
        accessToken,
        method: "POST",
        body: {
          period: quotaPeriod,
          year,
          ...(periodIndex !== undefined ? { periodIndex } : {}),
          amount,
          ...(actual ? { actual } : {}),
        },
      });
      setQuotaAmount("");
      setQuotaActual("");
      setRefresh(current => current + 1);
    } catch (cause) {
      setQuotaError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a cota."
      );
    }
  }

  if (loading) {
    return <p>Carregando detalhes do território...</p>;
  }

  if (error) {
    return (
      <p className="companies-view__error" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="territory-detail" aria-label="Detalhes do território">
      {metrics ? (
        <div className="companies-view__grid" aria-label="Métricas">
          <article className="companies-view__card">
            <span>Cobertura</span>
            <strong>{metrics.coveragePercentage}%</strong>
            <small>
              {metrics.coveredCount}/{metrics.targetCount} empresas
            </small>
          </article>
          <article className="companies-view__card">
            <span>Cota atingida</span>
            <strong>{metrics.quotaPercentage}%</strong>
            {metrics.quotaYear && metrics.quotaPeriod ? (
              <small>
                {metrics.quotaPeriod === "MONTH"
                  ? "Mensal"
                  : metrics.quotaPeriod === "QUARTER"
                    ? "Trimestral"
                    : "Anual"}{" "}
                · {metrics.quotaYear}
              </small>
            ) : null}
          </article>
          <article className="companies-view__card">
            <span>Receita realizada</span>
            <strong>{formatCurrency(metrics.actualRevenue)}</strong>
          </article>
        </div>
      ) : null}

      <section aria-labelledby={`coverage-${territoryId}-title`}>
        <h3 id={`coverage-${territoryId}-title`}>Cobertura de empresas</h3>
        {coverage.length === 0 ? (
          <p>Nenhuma empresa-alvo cadastrada.</p>
        ) : (
          <div
            className="crm-table-scroll"
            role="region"
            aria-label="Dados do território"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Situação</th>
                  {canWrite ? <th aria-label="Ações" /> : null}
                </tr>
              </thead>
              <tbody>
                {coverage.map(target => (
                  <tr key={target.id}>
                    <td>{target.company.legalName}</td>
                    <td>
                      {canWrite ? (
                        <select
                          aria-label={`Situação de cobertura de ${target.company.legalName}`}
                          value={target.coverageStatus}
                          onChange={event =>
                            void updateCoverageStatus(
                              target,
                              event.target.value as CoverageStatus
                            )
                          }
                        >
                          {(
                            Object.keys(COVERAGE_LABELS) as CoverageStatus[]
                          ).map(status => (
                            <option key={status} value={status}>
                              {COVERAGE_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        COVERAGE_LABELS[target.coverageStatus]
                      )}
                    </td>
                    {canWrite ? (
                      <td>
                        <button
                          type="button"
                          onClick={() => void removeCoverage(target)}
                          aria-label={`Remover ${target.company.legalName}`}
                        >
                          Remover
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite ? (
          <form
            aria-label="Adicionar empresa-alvo"
            onSubmit={addCoverage}
            className="sales-report__filters"
          >
            <label>
              <span>Buscar empresa</span>
              <input
                type="search"
                value={companyQuery}
                placeholder="Razão social, nome fantasia ou documento"
                onChange={event => setCompanyQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={companyLoading}
              onClick={() => void searchCompanies()}
            >
              {companyLoading ? "Buscando..." : "Buscar"}
            </button>
            <label>
              <span>Empresa-alvo</span>
              <select
                aria-label="Empresa-alvo"
                value={companyId}
                onChange={event => setCompanyId(event.target.value)}
              >
                <option value="">Selecione uma empresa</option>
                {companyOptions.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.tradeName
                      ? `${company.tradeName} — ${company.legalName}`
                      : company.legalName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Adicionar</button>
          </form>
        ) : null}
        {coverageError ? (
          <p className="companies-view__error" role="alert">
            {coverageError}
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`quotas-${territoryId}-title`}>
        <h3 id={`quotas-${territoryId}-title`}>Cotas</h3>
        {quotas.length === 0 ? (
          <p>Nenhuma cota cadastrada.</p>
        ) : (
          <div
            className="crm-table-scroll"
            role="region"
            aria-label="Dados do território"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Ano</th>
                  <th>Meta</th>
                  <th>Realizado</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map(quota => (
                  <tr key={quota.id}>
                    <td>{quotaPeriodLabel(quota)}</td>
                    <td>{quota.year}</td>
                    <td>{formatCurrency(quota.amount)}</td>
                    <td>{formatCurrency(quota.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite ? (
          <form
            aria-label="Definir cota"
            onSubmit={submitQuota}
            className="sales-report__filters"
          >
            <label>
              <span>Período</span>
              <select
                value={quotaPeriod}
                onChange={event => {
                  const next = event.target.value as Quota["period"];
                  setQuotaPeriod(next);
                  setQuotaPeriodIndex(next === "YEAR" ? "0" : "1");
                }}
              >
                <option value="MONTH">Mensal</option>
                <option value="QUARTER">Trimestral</option>
                <option value="YEAR">Anual</option>
              </select>
            </label>
            {quotaPeriod === "MONTH" ? (
              <label>
                <span>Mês</span>
                <select
                  value={quotaPeriodIndex}
                  onChange={event => setQuotaPeriodIndex(event.target.value)}
                >
                  {MONTH_LABELS.map((label, index) => (
                    <option key={label} value={String(index + 1)}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {quotaPeriod === "QUARTER" ? (
              <label>
                <span>Trimestre</span>
                <select
                  value={quotaPeriodIndex}
                  onChange={event => setQuotaPeriodIndex(event.target.value)}
                >
                  {[1, 2, 3, 4].map(index => (
                    <option key={index} value={String(index)}>
                      {index}º trimestre
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>Ano</span>
              <input
                type="number"
                value={quotaYear}
                onChange={event => setQuotaYear(event.target.value)}
              />
            </label>
            <label>
              <span>Meta</span>
              <input
                inputMode="decimal"
                value={quotaAmount}
                onChange={event => setQuotaAmount(event.target.value)}
              />
            </label>
            <label>
              <span>Realizado</span>
              <input
                inputMode="decimal"
                value={quotaActual}
                onChange={event => setQuotaActual(event.target.value)}
              />
            </label>
            <button type="submit">Salvar cota</button>
          </form>
        ) : null}
        {quotaError ? (
          <p className="companies-view__error" role="alert">
            {quotaError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
