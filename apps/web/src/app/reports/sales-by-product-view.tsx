"use client";

import {
  SalesByProductOwnersSchema,
  SalesByProductReportSchema,
  type SalesByProductBucket,
  type SalesByProductOwner,
  type SalesByProductReport,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { downloadAuthenticatedFile } from "../../lib/api-download";

type SalesByProductViewProps = {
  accessToken: string;
};

export type SalesByProductFilters = {
  from: string;
  to: string;
  pipelineId?: string;
  ownerUserId?: string;
};

type PipelineOption = { id: string; name: string };

const EMPTY_FILTERS: SalesByProductFilters = {
  from: "",
  to: "",
  pipelineId: "",
  ownerUserId: "",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function formatCurrency(value: string): string {
  return currencyFormatter.format(Number(value)).replace(/[  ]/g, " ");
}

function formatQuantity(value: string): string {
  return quantityFormatter.format(Number(value));
}

/** Converte a data do filtro (AAAA-MM-DD, fuso local) em instante ISO. */
export function periodBoundary(date: string, edge: "start" | "end"): string {
  const time = edge === "start" ? "T00:00:00.000" : "T23:59:59.999";
  return new Date(`${date}${time}`).toISOString();
}

function salesByProductQuery(filters: SalesByProductFilters): string {
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
  if (filters.ownerUserId) {
    params.set("ownerUserId", filters.ownerUserId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function salesByProductPath(filters: SalesByProductFilters): string {
  return `/reports/sales-by-product${salesByProductQuery(filters)}`;
}

export function salesByProductExportPath(
  filters: SalesByProductFilters
): string {
  return `/reports/sales-by-product/export${salesByProductQuery(filters)}`;
}

/** Nome de reserva caso o navegador não exponha o Content-Disposition. */
function fallbackCsvFilename(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `vendas-por-produto-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
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

function BucketCell({ bucket }: { bucket: SalesByProductBucket }) {
  return (
    <td>
      <strong>{formatCurrency(bucket.value)}</strong>
      <br />
      <small>
        Qtd. {formatQuantity(bucket.quantity)} · {bucket.opportunities}{" "}
        {bucket.opportunities === 1 ? "oportunidade" : "oportunidades"}
      </small>
    </td>
  );
}

export function SalesByProductView({ accessToken }: SalesByProductViewProps) {
  const [draft, setDraft] = useState<SalesByProductFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<SalesByProductFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<SalesByProductReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [owners, setOwners] = useState<SalesByProductOwner[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let active = true;

    // Opções dos filtros: uma falha aqui não impede o relatório.
    async function loadOptions() {
      const [pipelineResult, ownerResult] = await Promise.allSettled([
        apiRequest<unknown>("/pipelines", { accessToken }).then(parsePipelines),
        apiRequest<unknown>("/reports/sales-by-product/owners", {
          accessToken,
        }).then(payload => SalesByProductOwnersSchema.parse(payload)),
      ]);
      if (!active) {
        return;
      }
      if (pipelineResult.status === "fulfilled") {
        setPipelines(pipelineResult.value);
      }
      if (ownerResult.status === "fulfilled") {
        setOwners(ownerResult.value);
      }
      setOptionsError(
        pipelineResult.status === "rejected" ||
          ownerResult.status === "rejected"
          ? "Não foi possível carregar todas as opções de funil e responsável."
          : ""
      );
    }

    void loadOptions();

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
        const payload = await apiRequest<unknown>(salesByProductPath(filters), {
          accessToken,
        });
        const parsed = SalesByProductReportSchema.parse(payload);
        if (active) {
          setReport(parsed);
        }
      } catch (cause) {
        if (active) {
          setReport(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o relatório de vendas por produto."
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

  async function exportCsv() {
    setExporting(true);
    setExportError("");
    try {
      // Exporta os filtros aplicados (os mesmos da tabela exibida).
      await downloadAuthenticatedFile(
        salesByProductExportPath(filters),
        accessToken,
        fallbackCsvFilename()
      );
    } catch (cause) {
      setExportError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível exportar o relatório."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="sales-report" aria-labelledby="sales-by-product-title">
      <h2 id="sales-by-product-title">Vendas por produto</h2>
      <p className="activities-view__status">
        Itens das oportunidades por situação da etapa. O período considera a
        previsão de fechamento; o responsável é o dono da oportunidade.
      </p>

      <form
        className="sales-report__filters"
        aria-label="Filtros de vendas por produto"
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
        <label>
          <span>Responsável</span>
          <select
            value={draft.ownerUserId}
            onChange={event =>
              setDraft(current => ({
                ...current,
                ownerUserId: event.target.value,
              }))
            }
          >
            <option value="">Todos os responsáveis</option>
            {owners.map(owner => (
              <option key={owner.userId} value={owner.userId}>
                {owner.displayName}
                {owner.membershipActive ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Aplicar</button>
        <button type="button" onClick={clearFilters}>
          Limpar
        </button>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || loading || Boolean(error)}
        >
          {exporting ? "Exportando..." : "Exportar CSV"}
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
      {exportError ? (
        <p className="activities-view__error" role="alert">
          {exportError}
        </p>
      ) : null}

      {loading ? (
        <p className="activities-view__status">
          Carregando vendas por produto...
        </p>
      ) : error ? (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      ) : report && report.items.length === 0 ? (
        <p className="activities-view__status">
          Nenhum item de oportunidade encontrado com os filtros aplicados.
        </p>
      ) : report ? (
        <div className="sales-report__table">
          <table>
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Em aberto</th>
                <th scope="col">Ganho</th>
                <th scope="col">Perdido</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map(item => (
                <tr key={item.productId}>
                  <th scope="row">
                    {item.productCode} — {item.productName}
                    {item.productDeleted ? (
                      <small> (excluído)</small>
                    ) : !item.productActive ? (
                      <small> (inativo)</small>
                    ) : null}
                  </th>
                  <BucketCell bucket={item.open} />
                  <BucketCell bucket={item.won} />
                  <BucketCell bucket={item.lost} />
                  <BucketCell bucket={item.total} />
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
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}
