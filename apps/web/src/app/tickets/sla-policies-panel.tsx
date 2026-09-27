"use client";

import {
  TicketPrioritySchema,
  type SlaPolicy,
  type TicketPriority,
} from "@axes/contracts";
import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { formatSlaMinutes } from "./sla-labels";
import { priorityLabels } from "./ticket-labels";

type SlaPoliciesPanelProps = {
  accessToken: string;
  onClose: () => void;
};

type Draft = {
  firstResponseMinutes: string;
  resolutionMinutes: string;
  isActive: boolean;
};

const PRIORITIES: TicketPriority[] = [
  ...TicketPrioritySchema.options,
].reverse();

function draftFrom(policy: SlaPolicy | undefined): Draft {
  return {
    firstResponseMinutes: policy ? String(policy.firstResponseMinutes) : "",
    resolutionMinutes: policy ? String(policy.resolutionMinutes) : "",
    isActive: policy?.isActive ?? true,
  };
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * C5.3 — configuração das políticas de SLA por prioridade (support.manage).
 * Prazos em minutos corridos (24x7), contados a partir da abertura.
 */
export function SlaPoliciesPanel({
  accessToken,
  onClose,
}: SlaPoliciesPanelProps) {
  const [policies, setPolicies] = useState<
    Partial<Record<TicketPriority, SlaPolicy>>
  >({});
  const [drafts, setDrafts] = useState<Record<TicketPriority, Draft>>(
    () =>
      Object.fromEntries(
        PRIORITIES.map(priority => [priority, draftFrom(undefined)])
      ) as Record<TicketPriority, Draft>
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<TicketPriority | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<{ items: SlaPolicy[] }>("/sla-policies", { accessToken })
      .then(result => {
        if (!active) return;
        const byPriority = Object.fromEntries(
          result.items.map(policy => [policy.priority, policy])
        ) as Partial<Record<TicketPriority, SlaPolicy>>;
        setPolicies(byPriority);
        setDrafts(
          Object.fromEntries(
            PRIORITIES.map(priority => [
              priority,
              draftFrom(byPriority[priority]),
            ])
          ) as Record<TicketPriority, Draft>
        );
      })
      .catch(cause => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as políticas de SLA."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  function updateDraft(priority: TicketPriority, patch: Partial<Draft>) {
    setDrafts(current => ({
      ...current,
      [priority]: { ...current[priority], ...patch },
    }));
  }

  async function save(priority: TicketPriority) {
    const draft = drafts[priority];
    const firstResponseMinutes = positiveInteger(draft.firstResponseMinutes);
    const resolutionMinutes = positiveInteger(draft.resolutionMinutes);
    setMessage("");
    if (firstResponseMinutes === null || resolutionMinutes === null) {
      setError("Informe prazos em minutos inteiros maiores que zero.");
      return;
    }
    if (resolutionMinutes < firstResponseMinutes) {
      setError(
        "O prazo de resolução deve ser maior ou igual ao de primeira resposta."
      );
      return;
    }
    setSaving(priority);
    setError("");
    const existing = policies[priority];
    try {
      const saved = await apiRequest<SlaPolicy>(`/sla-policies/${priority}`, {
        accessToken,
        method: "PUT",
        body: {
          firstResponseMinutes,
          resolutionMinutes,
          isActive: draft.isActive,
          ...(existing ? { version: existing.version } : {}),
        },
      });
      setPolicies(current => ({ ...current, [priority]: saved }));
      setDrafts(current => ({ ...current, [priority]: draftFrom(saved) }));
      setMessage(`Política ${priorityLabels[priority]} salva.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a política de SLA."
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="company-form" aria-label="Políticas de SLA">
      <div className="company-form__heading">
        <div>
          <p>Configuração</p>
          <h2>Políticas de SLA</h2>
        </div>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="activities-view__status">
        Prazos em minutos corridos (24x7), contados a partir da abertura da
        solicitação. Alterações valem para novas solicitações e para mudanças de
        prioridade.
      </p>
      {error ? (
        <p className="companies-view__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {loading ? (
        <p>Carregando políticas...</p>
      ) : (
        <div className="company-import__table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Prioridade</th>
                <th scope="col">1ª resposta (min)</th>
                <th scope="col">Resolução (min)</th>
                <th scope="col">Ativa</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITIES.map(priority => {
                const draft = drafts[priority];
                const label = priorityLabels[priority];
                const first = positiveInteger(draft.firstResponseMinutes);
                const resolution = positiveInteger(draft.resolutionMinutes);
                return (
                  <tr key={priority}>
                    <th scope="row">{label}</th>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`Primeira resposta ${label} (minutos)`}
                        value={draft.firstResponseMinutes}
                        onChange={event =>
                          updateDraft(priority, {
                            firstResponseMinutes: event.target.value,
                          })
                        }
                      />
                      {first ? <small> {formatSlaMinutes(first)}</small> : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`Resolução ${label} (minutos)`}
                        value={draft.resolutionMinutes}
                        onChange={event =>
                          updateDraft(priority, {
                            resolutionMinutes: event.target.value,
                          })
                        }
                      />
                      {resolution ? (
                        <small> {formatSlaMinutes(resolution)}</small>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Política ${label} ativa`}
                        checked={draft.isActive}
                        onChange={event =>
                          updateDraft(priority, {
                            isActive: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button"
                        disabled={saving !== null}
                        onClick={() => void save(priority)}
                      >
                        {saving === priority
                          ? "Salvando..."
                          : `Salvar ${label}`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
