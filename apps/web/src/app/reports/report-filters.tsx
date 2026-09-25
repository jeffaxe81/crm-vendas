"use client";

import { SalesByOwnerReportSchema } from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

export type ReportFilters = {
  from: string;
  to: string;
  pipelineId: string;
  ownerUserId: string;
};

export const emptyReportFilters: ReportFilters = {
  from: "",
  to: "",
  pipelineId: "",
  ownerUserId: "",
};

export type FilterOption = { id: string; label: string };

/** Converte a data do filtro (AAAA-MM-DD, fuso local) em instante ISO. */
export function periodBoundary(date: string, edge: "start" | "end"): string {
  const time = edge === "start" ? "T00:00:00.000" : "T23:59:59.999";
  return new Date(`${date}${time}`).toISOString();
}

/** Monta a URL do relatório só com os filtros preenchidos. */
export function reportPath(
  base: string,
  filters: Partial<ReportFilters>
): string {
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
  return `${base}${query ? `?${query}` : ""}`;
}

function isNamedRecord(value: unknown): value is { id: string; name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

/**
 * Carrega funis e vendedores para os seletores. Falhas só deixam o seletor
 * com a opção "Todos": o relatório continua funcionando sem os filtros.
 */
export function useReportFilterOptions(
  accessToken: string,
  { owners: loadOwners }: { owners: boolean }
) {
  const [pipelines, setPipelines] = useState<FilterOption[]>([]);
  const [owners, setOwners] = useState<FilterOption[]>([]);

  useEffect(() => {
    let active = true;

    apiRequest<unknown>("/pipelines", { accessToken })
      .then(payload => {
        if (active && Array.isArray(payload)) {
          setPipelines(
            payload
              .filter(isNamedRecord)
              .map(pipeline => ({ id: pipeline.id, label: pipeline.name }))
          );
        }
      })
      .catch(() => undefined);

    if (loadOwners) {
      apiRequest<unknown>("/reports/sales-by-owner", { accessToken })
        .then(payload => {
          const parsed = SalesByOwnerReportSchema.safeParse(payload);
          if (active && parsed.success) {
            setOwners(
              parsed.data.items
                .map(owner => ({
                  id: owner.ownerUserId,
                  label: owner.ownerActive
                    ? owner.ownerName
                    : `${owner.ownerName} (inativo)`,
                }))
                .sort((left, right) =>
                  left.label.localeCompare(right.label, "pt-BR")
                )
            );
          }
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, [accessToken, loadOwners]);

  return { pipelines, owners };
}

type ReportFiltersFormProps = {
  label: string;
  pipelines: FilterOption[];
  owners?: FilterOption[];
  onApply: (filters: ReportFilters) => void;
};

export function ReportFiltersForm({
  label,
  pipelines,
  owners,
  onApply,
}: ReportFiltersFormProps) {
  const [draft, setDraft] = useState<ReportFilters>(emptyReportFilters);
  const [filterError, setFilterError] = useState("");

  function update(field: keyof ReportFilters, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setFilterError("");
    onApply({ ...draft });
  }

  function clearFilters() {
    setFilterError("");
    setDraft(emptyReportFilters);
    onApply(emptyReportFilters);
  }

  return (
    <>
      <form
        className="sales-report__filters"
        aria-label={label}
        onSubmit={applyFilters}
      >
        <label>
          <span>De</span>
          <input
            type="date"
            value={draft.from}
            onChange={event => update("from", event.target.value)}
          />
        </label>
        <label>
          <span>Até</span>
          <input
            type="date"
            value={draft.to}
            onChange={event => update("to", event.target.value)}
          />
        </label>
        <label>
          <span>Funil</span>
          <select
            value={draft.pipelineId}
            onChange={event => update("pipelineId", event.target.value)}
          >
            <option value="">Todos os funis</option>
            {pipelines.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {owners ? (
          <label>
            <span>Vendedor</span>
            <select
              value={draft.ownerUserId}
              onChange={event => update("ownerUserId", event.target.value)}
            >
              <option value="">Todos os vendedores</option>
              {owners.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
    </>
  );
}

/** Dispara o download de um CSV gerado no navegador. */
export function downloadCsv(fileName: string, content: string): void {
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

/** Nome de arquivo com a data da consulta: vendas-por-produto-2026-09-25.csv */
export function csvFileName(prefix: string, asOf: string): string {
  return `${prefix}-${asOf.slice(0, 10)}.csv`;
}
