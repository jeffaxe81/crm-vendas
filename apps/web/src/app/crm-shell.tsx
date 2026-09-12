"use client";

import type { AuthSessionResponse } from "@axes/contracts";
import type { ReactNode } from "react";

export type CrmSection =
  | "companies"
  | "contacts"
  | "activities"
  | "agenda"
  | "opportunities";

type CrmShellProps = {
  session: AuthSessionResponse;
  activeSection: CrmSection;
  onNavigate: (section: CrmSection) => void;
  onLogout: () => void;
  children: ReactNode;
};

export function CrmShell({
  session,
  activeSection,
  onNavigate,
  onLogout,
  children,
}: CrmShellProps) {
  const canReadActivities = session.permissions.includes("activity.read");
  const canReadOpportunities = session.permissions.includes("opportunity.read");
  const isActivitiesActive = activeSection === "activities";
  const isAgendaActive = activeSection === "agenda";
  const isOpportunitiesActive = activeSection === "opportunities";

  return (
    <main className="crm-shell" aria-label="Acesso ao CRM">
      <aside className="crm-shell__sidebar">
        <div className="crm-shell__brand">
          <span className="crm-shell__brand-mark" aria-hidden="true">
            AX
          </span>
          <div>
            <p className="crm-shell__brand-eyebrow">Axesistemas CRM</p>
            <p className="crm-shell__brand-title">Relacionamento</p>
          </div>
        </div>

        <div className="crm-shell__organization">
          <span>Organização ativa</span>
          <strong>{session.organization.name}</strong>
        </div>

        <nav className="crm-shell__nav" aria-label="Navegação principal">
          <button
            type="button"
            className={activeSection === "companies" ? "is-active" : undefined}
            aria-current={activeSection === "companies" ? "page" : undefined}
            onClick={() => onNavigate("companies")}
          >
            Empresas
          </button>
          <button
            type="button"
            className={activeSection === "contacts" ? "is-active" : undefined}
            aria-current={activeSection === "contacts" ? "page" : undefined}
            onClick={() => onNavigate("contacts")}
          >
            Contatos
          </button>
          {canReadActivities ? (
            <button
              type="button"
              className={isActivitiesActive ? "is-active" : undefined}
              aria-current={isActivitiesActive ? "page" : undefined}
              onClick={() => onNavigate("activities")}
            >
              Atividades
            </button>
          ) : null}
          {canReadActivities ? (
            <button
              type="button"
              className={isAgendaActive ? "is-active" : undefined}
              aria-current={isAgendaActive ? "page" : undefined}
              onClick={() => onNavigate("agenda")}
            >
              Agenda
            </button>
          ) : null}
          {canReadOpportunities ? (
            <button
              type="button"
              className={isOpportunitiesActive ? "is-active" : undefined}
              aria-current={isOpportunitiesActive ? "page" : undefined}
              onClick={() => onNavigate("opportunities")}
            >
              Oportunidades
            </button>
          ) : null}
        </nav>

        <section className="crm-shell__session" aria-label="Sessão ativa">
          <p>Sessão ativa</p>
          <strong>{session.user.displayName}</strong>
          <span>{session.user.email}</span>
          <span>{session.membership.role}</span>
          <button type="button" onClick={onLogout}>
            Sair com segurança
          </button>
        </section>
      </aside>

      <section className="crm-shell__workspace">
        <header className="crm-shell__topbar">
          <div>
            <p>CRM Core</p>
            <strong>Organização em uso</strong>
          </div>
          <span>Perfil {session.membership.role}</span>
        </header>
        <div className="crm-shell__content">{children}</div>
      </section>
    </main>
  );
}
