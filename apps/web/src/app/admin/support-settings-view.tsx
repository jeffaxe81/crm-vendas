"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { SupportQueuesPanel } from "../tickets/support-queues-panel";
import { SlaPoliciesPanel } from "../tickets/sla-policies-panel";
import type { SupportQueueRecord } from "../tickets/ticket-labels";
export function SupportSettingsView({ accessToken }: { accessToken: string }) {
  const [tab, setTab] = useState<"queues" | "sla" | null>(null);
  const [queues, setQueues] = useState<SupportQueueRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (tab !== "queues") return;
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<{ items: SupportQueueRecord[] }>(
      "/support-queues?active=all",
      { accessToken }
    )
      .then(payload => {
        if (active) setQueues(payload.items);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Filas indisponíveis."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, tab, version]);
  return (
    <section className="activities-view">
      <h1>Configuração de atendimento</h1>
      <div className="activities-view__status-tabs">
        <button type="button" onClick={() => setTab("queues")}>
          Filas
        </button>
        <button type="button" onClick={() => setTab("sla")}>
          Políticas de SLA
        </button>
      </div>
      {error ? (
        <p role="alert">
          {error}
          <button type="button" onClick={() => setVersion(value => value + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : null}
      {tab === "queues" && !error ? (
        loading ? (
          <p>Carregando filas...</p>
        ) : (
          <SupportQueuesPanel
            accessToken={accessToken}
            queues={queues}
            onChanged={() => setVersion(value => value + 1)}
            onClose={() => setTab(null)}
          />
        )
      ) : null}
      {tab === "sla" ? (
        <SlaPoliciesPanel
          accessToken={accessToken}
          onClose={() => setTab(null)}
        />
      ) : null}
    </section>
  );
}
