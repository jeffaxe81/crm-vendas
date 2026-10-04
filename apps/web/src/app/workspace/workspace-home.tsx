"use client";
import { useEffect, useState } from "react";
import {
  ManagementSummarySchema,
  availableWorkspaceDestinations,
  type ManagementSummary,
  type AuthSessionResponse,
  type WorkspaceSection,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
import { AgendaView } from "../agenda/agenda-view";
import type { ReportTab } from "../reports/management-summary-view";
import { DashboardWidgets } from "../reports/dashboard-widgets";
import { useWorkspace } from "./workspace-provider";

function HomeIndicators({
  accessToken,
  onNavigate,
  onOpenReport,
}: {
  accessToken: string;
  onOpenReport: (target: ReportTab) => void;
  onNavigate: (section: WorkspaceSection) => void;
}) {
  const w = useWorkspace()!;
  const [summary, setSummary] = useState<ManagementSummary | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void apiRequest<unknown>("/reports/management-summary", { accessToken })
      .then(payload => {
        const parsed = ManagementSummarySchema.parse(payload);
        if (active) setSummary(parsed);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Indicadores indisponíveis."
          );
      });
    return () => {
      active = false;
    };
  }, [accessToken, refresh]);
  return (
    <section aria-label="Indicadores comerciais">
      <h2>Indicadores comerciais</h2>
      <button type="button" onClick={() => setRefresh(value => value + 1)}>
        Atualizar indicadores
      </button>
      {error ? (
        <p role="alert">
          {error}
          {summary ? " Exibindo últimos dados carregados." : ""}
        </p>
      ) : null}
      {summary ? (
        <>
          <p>Resumo em {new Date(summary.asOf).toLocaleString("pt-BR")}</p>
          <DashboardWidgets
            summary={summary}
            accessToken={accessToken}
            refreshVersion={refresh}
            controlledLayout={{
              order: w.saved.dashboardOrder,
              hidden: w.saved.dashboardHidden,
            }}
            allowCustomization={false}
            onOpenReport={onOpenReport}
          />
        </>
      ) : !error ? (
        <p>Carregando indicadores...</p>
      ) : null}
    </section>
  );
}
export function WorkspaceHome({
  session,
  onNavigate,
  onOpenReport,
}: {
  session: AuthSessionResponse;
  onOpenReport: (target: ReportTab) => void;
  onNavigate: (section: WorkspaceSection) => void;
}) {
  const w = useWorkspace()!;
  const allowed = availableWorkspaceDestinations(session.permissions);
  const visible = w.saved.homeOrder.filter(
    id =>
      !w.saved.homeHidden.includes(id) &&
      (id !== "today" || session.permissions.includes("activity.read")) &&
      (id !== "indicators" || session.permissions.includes("reports.read"))
  );
  return (
    <section className="activities-view" aria-labelledby="workspace-home-title">
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Seu espaço de trabalho</p>
          <h1 id="workspace-home-title">Olá, {session.user.displayName}</h1>
          <p>{new Date().toLocaleDateString("pt-BR", { dateStyle: "full" })}</p>
        </div>
        <button type="button" onClick={() => onNavigate("workspace-settings")}>
          Personalizar início
        </button>
      </header>
      {w.error ? <p role="alert">{w.error}</p> : null}
      <div className="workspace-home-widgets">
        {w.loading ? (
          <p role="status">Carregando preferências...</p>
        ) : (
          visible.map(id => (
            <div key={id}>
              {id === "favorites" ? (
                <section aria-label="Atalhos favoritos">
                  <h2>Favoritos</h2>
                  {w.saved.favorites.length ? (
                    <div className="workspace-favorites">
                      {w.saved.favorites.map(section => {
                        const item = allowed.find(
                          destination => destination.id === section
                        );
                        return item ? (
                          <button
                            type="button"
                            key={section}
                            onClick={() => onNavigate(section)}
                          >
                            {item.label}
                          </button>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p>Escolha seus atalhos em Personalizar início.</p>
                  )}
                </section>
              ) : id === "today" ? (
                <AgendaView
                  accessToken={session.accessToken}
                  ownerUserId={session.user.id}
                  initialFocus="TODAY"
                />
              ) : (
                <HomeIndicators
                  accessToken={session.accessToken}
                  onNavigate={onNavigate}
                  onOpenReport={onOpenReport}
                />
              )}
            </div>
          ))
        )}
      </div>
      {!w.loading && !visible.length ? (
        <p>
          Nenhum componente disponível. Use Personalizar início para configurar
          sua tela.
        </p>
      ) : null}
    </section>
  );
}
