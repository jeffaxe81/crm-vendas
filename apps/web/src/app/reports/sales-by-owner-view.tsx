"use client";

import {
  SalesByOwnerReportSchema,
  salesByOwnerToCsv,
  type SalesByOwnerBucket,
  type SalesByOwnerReport,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { periodBoundary } from "./sales-by-product-view";

export { periodBoundary };

type SalesByOwnerViewProps = {
  accessToken: string;
};

export type SalesByOwnerFilters = {
  from: string;
  to: string;
  pipelineId?: string;
};

type PipelineOption = { id: string; name: string };

const EMPTY_FILTERS: SalesByOwnerFilters = {
  from: "",
  to: "",
  pipelineId: "",
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

function salesByOwnerQuery(filters: Partial<SalesByOwnerFilters>): string {
  const params = new URLSearchParams();
  if (filters.from) {
    params.set("from", periodBoundary(filters.from, "start"));
  }
  if (filters.to) {
    params.set("to", periodBoundary(filters.to, "end"));
  }
  if (filters.pipelineId) {
    params.set("pipelineId", filters.pipelineId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** O relatório de vendas por vendedor nunca aceita filtro de vendedor. */
export function salesByOwnerPath(
  filters: Partial<SalesByOwnerFilters> & { ownerUserId?: string }
): string {
  const { ownerUserId: _ownerUserId, ...rest } = filters;
  return `/reports/sales-by-owner${salesByOwnerQuery(rest)}`;
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
  const [draft, setDraft] = useState<SalesByOwnerFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<SalesByOwnerFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<SalesByOwnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
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

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setFilterError("");
    setFilters({ ...draft });
  }

  function clearFilters() {
    setFilterError("");
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  return (
    <section className="sales-report" aria-labelledby="sales-by-owner-title">
      <h2 id="sales-by-owner-title">Vendas por vendedor</h2>
      <p className="activities-view__status">
        Oportunidades por responsável e situação da etapa, pelo valor estimado.
        A conversão considera ganhas sobre ganhas e perdidas.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros de vendas por vendedor"
        onSubmit={applyFilters}
      >
        <label>
          <span>De</span>
          <input
            type="date"
            value={draft.from}
            onChange={event =>
              setDraft(current => ({ ...current, from: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Até</span>
          <input
            type="date"
            value={draft.to}
            onChange={event =>
              setDraft(current => ({ ...current, to: event.target.value }))
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
      {filterError ? (
        <p className="activities-view__error" role="alert">
          {filterError}
        </p>
      ) : null}
      {optionsError ? (
        <p className="activities-view__status">{optionsError}</p>
      ) : null}

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
                  `vendas-por-vendedor-${report.asOf.slice(0, 10)}.csv`,
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
