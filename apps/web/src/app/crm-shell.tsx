"use client";

import {
  workspaceDestinations,
  type AuthSessionResponse,
  type WorkspaceSection,
} from "@axes/contracts";
import { useWorkspace } from "./workspace/workspace-provider";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Database,
  Headset,
  KeyRound,
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
import { useTranslation } from "../i18n/language-provider";

import { defaultBranding, type TenantBranding } from "@axes/contracts";
import { brandingStyle } from "./branding/use-tenant-branding";

export type CrmSection = WorkspaceSection;

type CrmShellProps = {
  branding?: TenantBranding;
  session: AuthSessionResponse;
  activeSection: CrmSection;
  onNavigate: (section: CrmSection) => void;
  onLogout: () => void;
  onStartTour?: () => void;
  onOpenQuickSetup?: () => void;
  children: ReactNode;
};

const icons: Partial<Record<CrmSection, typeof Building2>> = {
  companies: Building2,
  contacts: UsersRound,
  activities: ClipboardList,
  agenda: CalendarDays,
  opportunities: TrendingUp,
  products: Package,
  territories: MapPin,
  tickets: Headset,
  communication: Headset,
  "management-summary": BarChart3,
  "admin-users": UsersRound,
  "support-settings": ShieldCheck,
  "workspace-settings": PanelLeft,
  "integration-credentials": KeyRound,
  "admin-backups": Database,
};
const navigation = workspaceDestinations.map(item => ({
  ...item,
  section: item.id,
  icon: icons[item.id] ?? Menu,
}));

const sidebarPreferenceKey = "axes-crm-sidebar-collapsed";

export function CrmShell({
  branding = defaultBranding,
  session,
  activeSection,
  onNavigate,
  onLogout,
  onStartTour,
  onOpenQuickSetup,
  children,
}: CrmShellProps) {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerOpen = mobile && drawerOpen;
  const items = navigation.filter(
    item =>
      (item.section !== "admin-backups" ||
        session.membership.isSuperuser === true) &&
      (!item.permission || session.permissions.includes(item.permission))
  );
  const favorites = (workspace?.saved.favorites ?? []).filter(id =>
    items.some(item => item.section === id)
  );
  const activeGroup = items.find(item => item.section === activeSection)?.group;
  useEffect(() => {
    if (activeGroup)
      setOpenGroups(groups =>
        groups.includes(activeGroup) ? groups : [...groups, activeGroup]
      );
  }, [activeGroup]);
  function renderItem(item: (typeof navigation)[number]) {
    const Icon = item.icon;
    return (
      <button
        key={item.section}
        type="button"
        aria-label={t(item.label)}
        title={collapsed && !mobile ? t(item.label) : undefined}
        className={activeSection === item.section ? "is-active" : undefined}
        aria-current={activeSection === item.section ? "page" : undefined}
        onClick={() => {
          onNavigate(item.section);
          setDrawerOpen(false);
        }}
      >
        <Icon aria-hidden="true" />
        <span>{t(item.label)}</span>
      </button>
    );
  }
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
      style={brandingStyle(branding)}
      className={`tenant-branded crm-shell${collapsed ? " crm-shell--collapsed" : ""}${mobileDrawerOpen ? " crm-shell--drawer-open" : ""}`}
    >
      <a className="crm-shell__skip" href="#crm-content">
        {t("Ir para o conteúdo")}
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
        aria-label={t("Navegação do CRM")}
        aria-modal={mobileDrawerOpen ? true : undefined}
        inert={mobile && !drawerOpen ? true : undefined}
      >
        <div className="crm-shell__brand">
          {mobile ? (
            <button
              ref={closeRef}
              type="button"
              className="crm-shell__icon-button"
              aria-label={t("Fechar navegação")}
              onClick={() => setDrawerOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
          {branding.logo ? (
            <img
              className="tenant-logo"
              src={branding.logo}
              alt="Logo da empresa"
            />
          ) : (
            <span className="crm-shell__brand-mark" aria-hidden="true">
              <ShieldCheck />
            </span>
          )}
          <div className="crm-shell__brand-copy">
            <p className="crm-shell__brand-eyebrow">{t("AXE Sistemas")}</p>
            <p className="crm-shell__brand-title">{t("AXE CRM")}</p>
          </div>
        </div>

        <div className="crm-shell__organization">
          <span>{t("Organização ativa")}</span>
          <strong>{session.organization.name}</strong>
          <span>
            {t("Identificador: ")}
            {session.organization.slug}
          </span>
        </div>

        <nav className="crm-shell__nav" aria-label={t("Navegação principal")}>
          {renderItem(items.find(item => item.section === "home")!)}
          {favorites.length ? (
            <div aria-label={t("Favoritos")}>
              <p className="crm-shell__nav-caption">{t("Favoritos")}</p>
              {favorites.map(id =>
                renderItem(items.find(item => item.section === id)!)
              )}
            </div>
          ) : null}
          {(
            [
              "Comercial",
              "Produtividade",
              "Atendimento",
              "Gestão",
              "Administração",
            ] as const
          ).map(group => {
            const entries = items.filter(
              item => item.group === group && !favorites.includes(item.section)
            );
            if (!entries.length) return null;
            const open = openGroups.includes(group);
            return (
              <div key={t(group)} className="workspace-nav-group">
                <button
                  type="button"
                  aria-label={t("Grupo {0}", { 0: t(group) })}
                  aria-expanded={open}
                  title={t(group)}
                  onClick={() =>
                    setOpenGroups(current =>
                      current.includes(group)
                        ? current.filter(value => value !== group)
                        : [...current, group]
                    )
                  }
                >
                  <Menu aria-hidden="true" />
                  <span>{t(group)}</span>
                </button>
                {open ? (
                  <div className="workspace-nav-group__items">
                    {entries.map(renderItem)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <section className="crm-shell__session" aria-label={t("Sessão ativa")}>
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
          {onOpenQuickSetup ? (
            <button
              type="button"
              onClick={onOpenQuickSetup}
              aria-label={t("Configuração rápida")}
              title={t("Abrir a configuração rápida do CRM")}
            >
              <ShieldCheck aria-hidden="true" />
              <span>{t("Configuração rápida")}</span>
            </button>
          ) : null}
          {onStartTour ? (
            <button
              type="button"
              onClick={onStartTour}
              aria-label={t("Ajuda: rever tour do CRM")}
              title={t("Rever o tour de funcionalidades")}
            >
              <ShieldCheck aria-hidden="true" />
              <span>{t("Ajuda · Rever tour")}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            aria-label={t("Sair com segurança")}
            title={t("Sair com segurança")}
          >
            <DoorOpen aria-hidden="true" />
            <span>{t("Sair com segurança")}</span>
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
                  ? t("Abrir navegação")
                  : collapsed
                    ? t("Expandir navegação")
                    : t("Recolher navegação")
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
              <p>{t("Portal comercial · AXE CRM")}</p>
              <strong>{t(currentLabel)}</strong>
            </div>
          </div>
          <span className="crm-shell__profile">
            {t("Perfil ")}
            {session.membership.role}
          </span>
        </header>
        <main
          id="crm-content"
          className="crm-shell__content"
          aria-label={t("Acesso ao CRM")}
          tabIndex={-1}
        >
          {children}
        </main>
      </section>
    </div>
  );
}
