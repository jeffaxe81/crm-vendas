"use client";

import {
  SalesByMonthReportSchema,
  salesByMonthToCsv,
  type SalesByMonthBucket,
  type SalesByMonthReport,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type SalesByMonthViewProps = {
  accessToken: string;
};

export type SalesByMonthFilters = {
  year: number;
  pipelineId?: string;
};

type PipelineOption = { id: string; name: string };

function defaultYear(): number {
  return new Date().getUTCFullYear();
}

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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCurrency(value: string): string {
  return currencyFormatter
    .format(Number(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

/** "66.7" → "66,7%"; sem fechamentos no mês → "—". */
export function formatWinRate(value: string | null): string {
  return value === null ? "—" : `${value.replace(".", ",")}%`;
}

function salesByMonthQuery(filters: SalesByMonthFilters): string {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  if (filters.pipelineId) {
    params.set("pipelineId", filters.pipelineId);
  }
  return `?${params.toString()}`;
}

export function salesByMonthPath(filters: SalesByMonthFilters): string {
  return `/reports/sales-by-month${salesByMonthQuery(filters)}`;
}

function parsePipelines(payload: unknown): PipelineOption[] {
  if (!Array.isArray(payload)) {
    throw new Error("Resposta inválida da lista de funis.");
  }
  return payload.flatMap(entry =>
    entry &&
    typeof entry === "object" &&
    typeof (entry as PipelineOption).id === "string" &&
    typeof (entry as PipelineOption).name === "string"
      ? [
          {
            id: (entry as PipelineOption).id,
            name: (entry as PipelineOption).name,
          },
        ]
      : []
  );
}

/** Dispara o download de um CSV gerado no navegador. */
function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BucketCell({ bucket }: { bucket: SalesByMonthBucket }) {
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

export function SalesByMonthView({ accessToken }: SalesByMonthViewProps) {
  const [draft, setDraft] = useState<SalesByMonthFilters>({
    year: defaultYear(),
    pipelineId: "",
  });
  const [filters, setFilters] = useState<SalesByMonthFilters>({
    year: defaultYear(),
    pipelineId: "",
  });
  const [report, setReport] = useState<SalesByMonthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [optionsError, setOptionsError] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest<unknown>("/pipelines", { accessToken })
      .then(parsePipelines)
      .then(result => {
        if (active) {
          setPipelines(result);
        }
      })
      .catch(() => {
        if (active) {
          setOptionsError("Não foi possível carregar a lista de funis.");
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(salesByMonthPath(filters), {
          accessToken,
        });
        const parsed = SalesByMonthReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de vendas por período."
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

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...draft });
  }

  function clearFilters() {
    const cleared = { year: defaultYear(), pipelineId: "" };
    setDraft(cleared);
    setFilters(cleared);
  }

  return (
    <section className="sales-report" aria-labelledby="sales-by-month-title">
      <h2 id="sales-by-month-title">Vendas por período mensal</h2>
      <p className="activities-view__status">
        Oportunidades por mês de previsão de fechamento e situação da etapa,
        pelo valor estimado.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros de vendas por período mensal"
        onSubmit={applyFilters}
      >
        <label>
          <span>Ano</span>
          <input
            type="number"
            min={2000}
            max={2100}
            value={draft.year}
            onChange={event =>
              setDraft(current => ({
                ...current,
                year: Number(event.target.value),
              }))
            }
          />
        </label>
        <label>
          <span>Funil</span>
          <select
            value={draft.pipelineId}
            onChange={event =>
              setDraft(current => ({
                ...current,
                pipelineId: event.target.value,
              }))
            }
          >
            <option value="">Todos os funis</option>
            {pipelines.map(pipeline => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Aplicar</button>
        <button type="button" onClick={clearFilters}>
          Limpar
        </button>
      </form>
      {optionsError ? (
        <p className="activities-view__status">{optionsError}</p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">
          Carregando vendas por período...
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : report ? (
        <div className="sales-report__table">
          <div className="sales-report__actions">
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `vendas-por-periodo-${report.filters.year}.csv`,
                  salesByMonthToCsv(report)
                )
              }
            >
              Exportar CSV
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col">Em aberto</th>
                <th scope="col">Ganho</th>
                <th scope="col">Perdido</th>
                <th scope="col">Total</th>
                <th scope="col">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map(item => (
                <tr key={item.month}>
                  <th scope="row">{MONTH_LABELS[item.month - 1]}</th>
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
                <th scope="row">Total do ano</th>
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
