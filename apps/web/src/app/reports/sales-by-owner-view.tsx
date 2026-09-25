"use client";

import {
  SalesByOwnerReportSchema,
  salesByOwnerToCsv,
  type SalesByOwnerBucket,
  type SalesByOwnerReport,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import {
  csvFileName,
  downloadCsv,
  emptyReportFilters,
  ReportFiltersForm,
  reportPath,
  useReportFilterOptions,
  type ReportFilters,
} from "./report-filters";

type SalesByOwnerViewProps = {
  accessToken: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: string): string {
  return currencyFormatter
    .format(Number(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

/** "66.7" → "66,7%"; sem fechamentos no período → "—". */
export function formatWinRate(value: string | null): string {
  return value === null ? "—" : `${value.replace(".", ",")}%`;
}

export function salesByOwnerPath(filters: Partial<ReportFilters>): string {
  const { ownerUserId: _ownerUserId, ...rest } = filters;
  return reportPath("/reports/sales-by-owner", rest);
}

function BucketCell({ bucket }: { bucket: SalesByOwnerBucket }) {
  return (
    <td>
      <strong>{formatCurrency(bucket.value)}</strong>
      <br />
      <small>
        {bucket.opportunities}{" "}
        {bucket.opportunities === 1 ? "oportunidade" : "oportunidades"}
      </small>
    </td>
  );
}

export function SalesByOwnerView({ accessToken }: SalesByOwnerViewProps) {
  const [filters, setFilters] = useState<ReportFilters>(emptyReportFilters);
  const [report, setReport] = useState<SalesByOwnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const options = useReportFilterOptions(accessToken, { owners: false });

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(salesByOwnerPath(filters), {
          accessToken,
        });
        const parsed = SalesByOwnerReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de vendas por vendedor."
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
  }, [accessToken, filters]);

  return (
    <section className="sales-report" aria-labelledby="sales-by-owner-title">
      <h2 id="sales-by-owner-title">Vendas por vendedor</h2>
      <p className="activities-view__status">
        Oportunidades por responsável e situação da etapa, pelo valor estimado.
        A conversão considera ganhas sobre ganhas e perdidas.
      </p>

      <ReportFiltersForm
        label="Filtros de vendas por vendedor"
        pipelines={options.pipelines}
        onApply={setFilters}
      />

      {loading ? (
        <p className="activities-view__status">
          Carregando vendas por vendedor...
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : report && report.items.length === 0 ? (
        <p className="activities-view__status">
          Nenhuma oportunidade encontrada no período.
        </p>
      ) : report ? (
        <div className="sales-report__table">
          <div className="sales-report__actions">
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  csvFileName("vendas-por-vendedor", report.asOf),
                  salesByOwnerToCsv(report)
                )
              }
            >
              Exportar CSV
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Vendedor</th>
                <th scope="col">Em aberto</th>
                <th scope="col">Ganho</th>
                <th scope="col">Perdido</th>
                <th scope="col">Total</th>
                <th scope="col">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map(item => (
                <tr key={item.ownerUserId}>
                  <th scope="row">
                    {item.ownerName}
                    {item.ownerActive ? null : <small> (inativo)</small>}
                  </th>
                  <BucketCell bucket={item.open} />
                  <BucketCell bucket={item.won} />
                  <BucketCell bucket={item.lost} />
                  <BucketCell bucket={item.total} />
                  <td>{formatWinRate(item.winRate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total geral</th>
                <BucketCell bucket={report.totals.open} />
                <BucketCell bucket={report.totals.won} />
                <BucketCell bucket={report.totals.lost} />
                <BucketCell bucket={report.totals.total} />
                <td>{formatWinRate(report.totals.winRate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
