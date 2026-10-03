"use client";

import type { AuthSessionResponse } from "@axes/contracts";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Headset,
  MapPin,
  Menu,
  Package,
  PanelLeft,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type CrmSection =
  | "companies"
  | "contacts"
  | "activities"
  | "agenda"
  | "opportunities"
  | "products"
  | "territories"
  | "tickets"
  | "management-summary";

type CrmShellProps = {
  session: AuthSessionResponse;
  activeSection: CrmSection;
  onNavigate: (section: CrmSection) => void;
  onLogout: () => void;
  children: ReactNode;
};

const navigation = [
  { section: "companies", label: "Empresas", icon: Building2 },
  { section: "contacts", label: "Contatos", icon: UsersRound },
  {
    section: "activities",
    label: "Atividades",
    icon: ClipboardList,
    permission: "activity.read",
  },
  {
    section: "agenda",
    label: "Agenda",
    icon: CalendarDays,
    permission: "activity.read",
  },
  {
    section: "opportunities",
    label: "Oportunidades",
    icon: TrendingUp,
    permission: "opportunity.read",
  },
  {
    section: "tickets",
    label: "Atendimento",
    icon: Headset,
    permission: "ticket.read",
  },
  {
    section: "products",
    label: "Produtos",
    icon: Package,
    permission: "product.read",
  },
  {
    section: "territories",
    label: "Territórios",
    icon: MapPin,
    permission: "territory.read",
  },
  {
    section: "management-summary",
    label: "Resumo gerencial",
    icon: BarChart3,
    permission: "reports.read",
  },
] satisfies Array<{
  section: CrmSection;
  label: string;
  icon: typeof Building2;
  permission?: string;
}>;

const sidebarPreferenceKey = "axes-crm-sidebar-collapsed";

export function CrmShell({
  session,
  activeSection,
  onNavigate,
  onLogout,
  children,
}: CrmShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerOpen = mobile && drawerOpen;
  const items = navigation.filter(
    item => !item.permission || session.permissions.includes(item.permission)
  );
  const currentLabel =
    items.find(item => item.section === activeSection)?.label ?? "CRM";
  const initials = session.user.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(sidebarPreferenceKey) === "true");
    } catch {
      // Navigation remains available when browser storage is disabled.
    }
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 880px)");
    const update = () => {
      setMobile(media.matches);
      setDrawerOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = sidebarRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)"
      );
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      triggerRef.current?.focus();
    };
  }, [mobileDrawerOpen]);

  function toggleNavigation() {
    if (mobile) {
      setDrawerOpen(true);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(sidebarPreferenceKey, String(next));
    } catch {
      // Keep the current preference for this session without persistence.
    }
  }

  return (
    <div
      className={`crm-shell${collapsed ? " crm-shell--collapsed" : ""}${mobileDrawerOpen ? " crm-shell--drawer-open" : ""}`}
    >
      <a className="crm-shell__skip" href="#crm-content">
        Ir para o conteúdo
      </a>
      {mobileDrawerOpen ? (
        <div
          className="crm-shell__backdrop"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      <aside
        id="crm-navigation"
        ref={sidebarRef}
        className="crm-shell__sidebar"
        role={mobileDrawerOpen ? "dialog" : undefined}
        aria-label="Navegação do CRM"
        aria-modal={mobileDrawerOpen ? true : undefined}
        inert={mobile && !drawerOpen ? true : undefined}
      >
        <div className="crm-shell__brand">
          {mobile ? (
            <button
              ref={closeRef}
              type="button"
              className="crm-shell__icon-button"
              aria-label="Fechar navegação"
              onClick={() => setDrawerOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
          <span className="crm-shell__brand-mark" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div className="crm-shell__brand-copy">
            <p className="crm-shell__brand-eyebrow">AXE Sistemas</p>
            <p className="crm-shell__brand-title">AXE CRM</p>
          </div>
        </div>

        <div className="crm-shell__organization">
          <span>Organização ativa</span>
          <strong>{session.organization.name}</strong>
        </div>

        <nav className="crm-shell__nav" aria-label="Navegação principal">
          <p className="crm-shell__nav-caption">Operação comercial</p>
          {items.map(({ section, label, icon: Icon }) => (
            <button
              key={section}
              type="button"
              aria-label={label}
              title={collapsed && !mobile ? label : undefined}
              className={activeSection === section ? "is-active" : undefined}
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => {
                onNavigate(section);
                setDrawerOpen(false);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="crm-shell__session" aria-label="Sessão ativa">
          <div className="crm-shell__user">
            <span className="crm-shell__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="crm-shell__user-copy">
              <strong>{session.user.displayName}</strong>
              <span>{session.user.email}</span>
              <span>{session.membership.role}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sair com segurança"
            title="Sair com segurança"
          >
            <DoorOpen aria-hidden="true" />
            <span>Sair com segurança</span>
          </button>
        </section>
      </aside>

      <section
        className="crm-shell__workspace"
        inert={mobileDrawerOpen ? true : undefined}
      >
        <header className="crm-shell__topbar">
          <div className="crm-shell__topbar-leading">
            <button
              ref={triggerRef}
              type="button"
              className="crm-shell__icon-button"
              aria-label={
                mobile
                  ? "Abrir navegação"
                  : collapsed
                    ? "Expandir navegação"
                    : "Recolher navegação"
              }
              aria-controls="crm-navigation"
              aria-expanded={mobile ? drawerOpen : !collapsed}
              onClick={toggleNavigation}
            >
              {mobile ? (
                <Menu aria-hidden="true" />
              ) : (
                <PanelLeft aria-hidden="true" />
              )}
            </button>
            <div className="crm-shell__page-context">
              <p>Portal comercial · AXE CRM</p>
              <strong>{currentLabel}</strong>
            </div>
          </div>
          <span className="crm-shell__profile">
            Perfil {session.membership.role}
          </span>
        </header>
        <main
          id="crm-content"
          className="crm-shell__content"
          aria-label="Acesso ao CRM"
          tabIndex={-1}
        >
          {children}
        </main>
      </section>
    </div>
  );
}
