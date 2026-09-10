"use client";

import type { AuthSessionResponse } from "@axes/contracts";
import type { ReactNode } from "react";

export type CrmSection = "companies" | "contacts" | "activities";

type CrmShellProps = {
  session: AuthSessionResponse;
  permissions: string[];
  activeSection: CrmSection;
  onNavigate: (section: CrmSection) => void;
  onLogout: () => void;
  children: ReactNode;
};

export function CrmShell({
  session,
  permissions,
  activeSection,
  onNavigate,
  onLogout,
  children,
}: CrmShellProps) {
  const canReadActivities = permissions.includes("activity.read");
  const isActivitiesActive = activeSection === "activities";

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
