"use client";

import {
  SalesByMonthReportSchema,
  type SalesByMonthReport,
} from "@axes/contracts";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const months = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function MonthlySalesChart({
  accessToken,
  refreshVersion,
}: {
  accessToken: string;
  refreshVersion: number;
}) {
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [report, setReport] = useState<SalesByMonthReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<unknown>(`/reports/sales-by-month?year=${year}`, {
      accessToken,
    })
      .then(payload => {
        const parsed = SalesByMonthReportSchema.parse(payload);
        if (active) setReport(parsed);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as vendas."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, year, refreshVersion]);
  const maximum = Math.max(
    1,
    ...(report?.items.map(item => Number(item.won.value)) ?? [])
  );
  return (
    <section aria-labelledby="dashboard-sales-title">
      <h2 id="dashboard-sales-title">Vendas ganhas por mês</h2>
      <label>
        Ano do gráfico de vendas
        <select
          value={year}
          onChange={event => setYear(Number(event.target.value))}
        >
          {Array.from(
            { length: 6 },
            (_, i) => new Date().getUTCFullYear() - i
          ).map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <p>
        Valor estimado de oportunidades ganhas por mês da previsão de fechamento
        (UTC). O ano aplica-se apenas a este gráfico.
      </p>
      {loading ? (
        <p role="status">Carregando vendas...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : report ? (
        <>
          <ul className="dashboard-bars">
            {report.items.map(item => (
              <li key={item.month}>
                <span>{months[item.month - 1]}</span>
                <strong>
                  {money
                    .format(Number(item.won.value))
                    .replace(/[\u00a0\u202f]/g, " ")}
                </strong>
                <meter
                  min={0}
                  max={maximum}
                  value={Number(item.won.value)}
                  aria-label={`${months[item.month - 1]}: ${money.format(Number(item.won.value))}`}
                />
              </li>
            ))}
          </ul>
          <p>Dados em {new Date(report.asOf).toLocaleString("pt-BR")}</p>
        </>
      ) : null}
    </section>
  );
}
