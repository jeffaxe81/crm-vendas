"use client";

import {
  SalesByProductReportSchema,
  type SalesByProductBucket,
  type SalesByProductReport,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type SalesByProductViewProps = {
  accessToken: string;
};

type Period = { from: string; to: string };

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

export function salesByProductPath(period: Period): string {
  const params = new URLSearchParams();
  if (period.from) {
    params.set("from", periodBoundary(period.from, "start"));
  }
  if (period.to) {
    params.set("to", periodBoundary(period.to, "end"));
  }
  const query = params.toString();
  return `/reports/sales-by-product${query ? `?${query}` : ""}`;
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
  const [draft, setDraft] = useState<Period>({ from: "", to: "" });
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [report, setReport] = useState<SalesByProductReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReport() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<unknown>(salesByProductPath(period), {
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
  }, [accessToken, period]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setFilterError("");
    setPeriod({ ...draft });
  }

  function clearFilters() {
    setFilterError("");
    setDraft({ from: "", to: "" });
    setPeriod({ from: "", to: "" });
  }

  return (
    <section className="sales-report" aria-labelledby="sales-by-product-title">
      <h2 id="sales-by-product-title">Vendas por produto</h2>
      <p className="activities-view__status">
        Itens das oportunidades por situação da etapa. O período considera a
        previsão de fechamento.
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
          Nenhum item de oportunidade encontrado no período.
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
