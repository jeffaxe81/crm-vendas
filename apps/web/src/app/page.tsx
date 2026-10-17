"use client";

import {
  AuthSessionResponseSchema,
  availableWorkspaceDestinations,
  type AuthSessionResponse,
} from "@axes/contracts";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Headset, PanelRightClose, PanelRightOpen } from "lucide-react";

import { authApiRequest, SESSION_UNAUTHORIZED_EVENT } from "../lib/api-client";
import { ActivitiesView } from "./activities/activities-view";
import { AgendaView } from "./agenda/agenda-view";
import { CompaniesView } from "./companies/companies-view";
import { ContactsView } from "./contacts/contacts-view";
import { CrmShell, type CrmSection } from "./crm-shell";
import { OpportunitiesView } from "./opportunities/opportunities-view";
import { ProductsView } from "./products/products-view";
import { TicketsView } from "./tickets/tickets-view";
import {
  ManagementSummaryView,
  type ReportTab,
} from "./reports/management-summary-view";
import { TerritoriesView } from "./territories/territories-view";
import { CommunicationView } from "./communication/communication-view";

import { WorkspaceProvider } from "./workspace/workspace-provider";
import { WorkspaceHome } from "./workspace/workspace-home";
import { WorkspaceEditor } from "./workspace/workspace-editor";
import { FirstAccessExperience } from "./workspace/first-access-experience";
import { QuickSetupExperience } from "./workspace/quick-setup-experience";
import { UsersView } from "./admin/users-view";
import { SupportSettingsView } from "./admin/support-settings-view";
import { IntegrationCredentialsView } from "./admin/integration-credentials-view";
import { BackupAdministrationView } from "./admin/backup-administration-view";
import { LanguageSettingsView } from "./admin/language-settings-view";
import { LanguageProvider } from "../i18n/language-provider";
import { useTranslation } from "../i18n/language-provider";

import {
  useTenantBranding,
  brandingStyle,
} from "./branding/use-tenant-branding";
import { BrandingEditor } from "./branding/branding-editor";

export default function Home() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState("");
  return (
    <LanguageProvider session={session} loginSlug={organizationSlug}>
      <HomeContent
        session={session}
        setSession={setSession}
        organizationSlug={organizationSlug}
        setOrganizationSlug={setOrganizationSlug}
      />
    </LanguageProvider>
  );
}

function HomeContent({
  session,
  setSession,
  organizationSlug,
  setOrganizationSlug,
}: {
  session: AuthSessionResponse | null;
  setSession: Dispatch<SetStateAction<AuthSessionResponse | null>>;
  organizationSlug: string;
  setOrganizationSlug: (value: string) => void;
}) {
  const { t } = useTranslation();
  const manualNavigation = useRef(false);
  const [reportTab, setReportTab] = useState<ReportTab>("summary");
  const [tourReplayToken, setTourReplayToken] = useState(0);
  const [quickSetupOpenToken, setQuickSetupOpenToken] = useState(0);
  const tenantBranding = useTenantBranding(session);
  const [activeSection, setActiveSection] = useState<CrmSection>("home");
  const [communicationOpened, setCommunicationOpened] = useState(false);
  const [communicationDockOpen, setCommunicationDockOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const restoreSessionRequest =
    useRef<Promise<AuthSessionResponse | null> | null>(null);

  useEffect(() => {
    let active = true;

    if (!restoreSessionRequest.current) {
      restoreSessionRequest.current = authApiRequest<unknown>("/auth/refresh", {
        method: "POST",
      })
        .then(payload => AuthSessionResponseSchema.parse(payload))
        .catch(() => null);
    }

    void restoreSessionRequest.current.then(restoredSession => {
      if (active && restoredSession) {
        manualNavigation.current = false;
        setSession(restoredSession);
        setActiveSection("home");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const accessToken = session?.accessToken;
  const expiresIn = session?.expiresIn;
  const organizationId = session?.organization.id;
  const userId = session?.user.id;
  const membershipId = session?.membership.id;

  useEffect(() => {
    if (!accessToken || !expiresIn) return;
    let active = true;

    function expireSession() {
      if (!active) return;
      active = false;
      manualNavigation.current = false;
      setSession(null);
      setQuickSetupOpenToken(0);
      setCommunicationOpened(false);
      setCommunicationDockOpen(false);
      setPassword("");
      setError(
        "Sua sessão expirou ou foi invalidada. Entre novamente para continuar."
      );
    }

    function onUnauthorized(event: Event) {
      // A late response from an old session must not close a newer login.
      if ((event as CustomEvent<string>).detail === accessToken)
        expireSession();
    }

    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, onUnauthorized);
    const timer = window.setTimeout(
      () => {
        void authApiRequest<unknown>("/auth/refresh", { method: "POST" })
          .then(payload => {
            const refreshed = AuthSessionResponseSchema.parse(payload);
            // Never switch the active tenant/account because another tab changed its cookie.
            if (
              refreshed.organization.id !== organizationId ||
              refreshed.user.id !== userId ||
              refreshed.membership.id !== membershipId
            ) {
              expireSession();
              return;
            }
            if (active) setSession(refreshed);
          })
          .catch(() => expireSession());
      },
      Math.max(1000, Math.floor(expiresIn * 800))
    );

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, [accessToken, expiresIn, organizationId, userId, membershipId]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = await authApiRequest<unknown>("/auth/login", {
        method: "POST",
        body: {
          email,
          password,
          ...(organizationSlug.trim()
            ? { organizationSlug: organizationSlug.trim() }
            : {}),
        },
      });
      manualNavigation.current = false;
      setSession(AuthSessionResponseSchema.parse(payload));
      setTourReplayToken(0);
      setQuickSetupOpenToken(0);
      setActiveSection("home");
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível autenticar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (adminPassword !== adminPasswordConfirm) {
      setError(t("As senhas não coincidem."));
      return;
    }

    setSubmitting(true);

    try {
      const payload = await authApiRequest<unknown>("/auth/register", {
        method: "POST",
        body: { organizationName, adminDisplayName, adminEmail, adminPassword },
      });
      manualNavigation.current = false;
      setSession(AuthSessionResponseSchema.parse(payload));
      setTourReplayToken(0);
      setQuickSetupOpenToken(0);
      setActiveSection("home");
      setAdminPassword("");
      setAdminPasswordConfirm("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível cadastrar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
  }

  async function logout() {
    setError("");
    try {
      await authApiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      manualNavigation.current = false;
      setSession(null);
      setQuickSetupOpenToken(0);
      setCommunicationOpened(false);
      setCommunicationDockOpen(false);
      setPassword("");
    }
  }

  function navigate(section: CrmSection) {
    if (
      !session ||
      !availableWorkspaceDestinations(
        session.permissions,
        session.membership.isSuperuser === true
      ).some(item => item.id === section)
    )
      return;
    manualNavigation.current = true;
    if (section === "management-summary") setReportTab("summary");
    if (section === "communication") {
      setCommunicationOpened(true);
      setCommunicationDockOpen(false);
    }
    setActiveSection(section);
  }

  if (session) {
    return (
      <WorkspaceProvider
        key={`${session.organization.id}:${session.user.id}`}
        session={session}
        onInitialPreferences={preferences => {
          if (!manualNavigation.current) {
            setActiveSection(preferences.defaultSection);
            if (preferences.defaultSection === "communication")
              setCommunicationOpened(true);
          }
        }}
      >
        <CrmShell
          branding={tenantBranding.branding}
          session={session}
          onStartTour={() => setTourReplayToken(value => value + 1)}
          onOpenQuickSetup={() => setQuickSetupOpenToken(value => value + 1)}
          activeSection={activeSection}
          onNavigate={navigate}
          onLogout={() => void logout()}
        >
          {activeSection === "home" ? (
            <WorkspaceHome
              session={session}
              onNavigate={navigate}
              onOpenReport={target => {
                navigate("management-summary");
                setReportTab(target);
              }}
            />
          ) : activeSection === "workspace-settings" ? (
            <>
              {session.membership.role === "ADMIN" &&
              session.permissions.includes("organization.manage") ? (
                <BrandingEditor
                  branding={tenantBranding.branding}
                  save={tenantBranding.save}
                  loading={tenantBranding.loading}
                />
              ) : null}
              {tenantBranding.error ? (
                <p role="alert">{tenantBranding.error}</p>
              ) : null}
              <WorkspaceEditor session={session} />
            </>
          ) : activeSection === "language-settings" &&
            session.permissions.includes("organization.manage") ? (
            <LanguageSettingsView />
          ) : activeSection === "admin-users" &&
            session.permissions.includes("user.manage") ? (
            <UsersView accessToken={session.accessToken} />
          ) : activeSection === "support-settings" &&
            session.permissions.includes("support.manage") ? (
            <SupportSettingsView accessToken={session.accessToken} />
          ) : activeSection === "integration-credentials" &&
            session.permissions.includes("integration.read") ? (
            <IntegrationCredentialsView
              accessToken={session.accessToken}
              currentUserId={session.user.id}
              permissions={session.permissions}
            />
          ) : activeSection === "admin-backups" &&
            session.membership.isSuperuser === true ? (
            <BackupAdministrationView accessToken={session.accessToken} />
          ) : activeSection === "companies" ? (
            <CompaniesView
              accessToken={session.accessToken}
              canWrite={session.permissions.includes("company.write")}
            />
          ) : activeSection === "contacts" ? (
            <ContactsView
              accessToken={session.accessToken}
              canWrite={session.permissions.includes("contact.write")}
            />
          ) : activeSection === "activities" ? (
            <ActivitiesView
              accessToken={session.accessToken}
              ownerUserId={session.user.id}
              canWrite={session.permissions.includes("activity.write")}
            />
          ) : activeSection === "agenda" ? (
            <AgendaView
              accessToken={session.accessToken}
              ownerUserId={session.user.id}
            />
          ) : activeSection === "tickets" ? (
            <TicketsView
              accessToken={session.accessToken}
              canWrite={session.permissions.includes("ticket.write")}
              currentUserId={session.user.id}
              canManageQueues={session.permissions.includes("support.manage")}
              canManageSla={session.permissions.includes("support.manage")}
            />
          ) : activeSection === "products" ? (
            <ProductsView
              accessToken={session.accessToken}
              canWrite={session.permissions.includes("product.write")}
            />
          ) : activeSection === "territories" ? (
            <TerritoriesView
              accessToken={session.accessToken}
              canWrite={session.permissions.includes("territory.write")}
            />
          ) : activeSection === "management-summary" ? (
            <ManagementSummaryView
              key={reportTab}
              initialTab={reportTab}
              accessToken={session.accessToken}
              preferenceScope={`${session.organization.id}:${session.user.id}`}
            />
          ) : activeSection === "opportunities" ? (
            <OpportunitiesView
              accessToken={session.accessToken}
              ownerUserId={session.user.id}
              canWrite={session.permissions.includes("opportunity.write")}
              canMove={session.permissions.includes("opportunity.move")}
            />
          ) : null}
          {communicationOpened &&
          session.permissions.includes("ticket.read") ? (
            <>
              {activeSection !== "communication" ? (
                <button
                  className="communication-dock__trigger"
                  type="button"
                  aria-expanded={communicationDockOpen}
                  aria-controls="neo-communication-panel"
                  onClick={() => setCommunicationDockOpen(open => !open)}
                >
                  <Headset aria-hidden="true" />
                  {communicationDockOpen
                    ? t("Recolher comunicação")
                    : t("Abrir comunicação")}
                </button>
              ) : null}
              <div
                id="neo-communication-panel"
                className={
                  activeSection === "communication"
                    ? "communication-dock communication-dock--full"
                    : communicationDockOpen
                      ? "communication-dock communication-dock--floating"
                      : "communication-dock communication-dock--closed"
                }
                hidden={
                  activeSection !== "communication" && !communicationDockOpen
                }
              >
                {activeSection !== "communication" && communicationDockOpen ? (
                  <div className="communication-dock__toolbar">
                    <strong>{t("NEO Interact")}</strong>
                    <button
                      type="button"
                      onClick={() => setCommunicationDockOpen(false)}
                      aria-label={t("Recolher painel NEO Interact")}
                    >
                      <PanelRightClose aria-hidden="true" />
                      {t("Recolher")}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("communication")}
                      aria-label={t("Abrir comunicação em tela inteira")}
                    >
                      <PanelRightOpen aria-hidden="true" />
                      {t("Expandir")}
                    </button>
                  </div>
                ) : null}
                <CommunicationView accessToken={session.accessToken} />
              </div>
            </>
          ) : null}
          <FirstAccessExperience
            session={session}
            onNavigate={navigate}
            replayToken={tourReplayToken}
            onOrganizationNameChange={name =>
              setSession(current =>
                current
                  ? {
                      ...current,
                      organization: { ...current.organization, name },
                    }
                  : current
              )
            }
          />
          <QuickSetupExperience
            session={session}
            onNavigate={navigate}
            openToken={quickSetupOpenToken}
          />
        </CrmShell>
      </WorkspaceProvider>
    );
  }

  return (
    <main
      className="login-shell tenant-branded"
      style={brandingStyle(tenantBranding.branding)}
    >
      <section className="login-brand" aria-labelledby="crm-title">
        {tenantBranding.branding.logo ? (
          <img
            className="tenant-logo tenant-logo--login"
            src={tenantBranding.branding.logo}
            alt={t("Logo da empresa")}
          />
        ) : (
          <p className="login-brand__eyebrow">{t("Axesistemas")}</p>
        )}
        <h1 id="crm-title">{t("CRM Axesistemas")}</h1>
        <p className="login-brand__lead">
          {t(
            "Relacionamento e vendas em uma base segura, preparada para organizações independentes."
          )}
        </p>
        <div className="login-brand__status">
          <span aria-hidden="true">●</span>
          {t("Ciclo 2 — CRM Core")}
        </div>
      </section>

      <section className="login-card" aria-label={t("Acesso ao CRM")}>
        {mode === "login" ? (
          <>
            <p className="login-card__eyebrow">{t("Acesso seguro")}</p>
            <h2>{t("Entrar")}</h2>
            <p className="login-card__help">
              {t("Use seu e-mail e senha cadastrados na organização.")}
            </p>

            <form className="login-form" onSubmit={login}>
              <label>
                <span>{t("E-mail")}</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>{t("Senha")}</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>{t("Identificador da empresa (opcional)")}</span>
                <input
                  name="organizationSlug"
                  value={organizationSlug}
                  onChange={event => setOrganizationSlug(event.target.value)}
                  maxLength={80}
                  autoCapitalize="none"
                  aria-describedby="organization-login-help"
                />
              </label>
              <p id="organization-login-help" className="login-card__help">
                {t(
                  "Obrigatório se sua conta tem acesso a mais de uma empresa. Use o identificador informado pelo administrador."
                )}
              </p>

              {error ? (
                <p className="login-form__error" role="alert">
                  {t(error)}
                </p>
              ) : null}

              <button className="button" type="submit" disabled={submitting}>
                {submitting ? t("Autenticando...") : t("Entrar no CRM")}
              </button>
            </form>

            <p className="login-card__security">
              {t(
                "O refresh token permanece protegido em cookie HttpOnly e não é armazenado pela interface."
              )}
            </p>

            <p className="login-card__switch">
              {t("Ainda não tem uma organização cadastrada?")}{" "}
              <button
                type="button"
                className="login-card__link"
                onClick={() => switchMode("register")}
              >
                {t("Cadastre-se")}
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="login-card__eyebrow">{t("Primeiro acesso")}</p>
            <h2>{t("Cadastrar organização")}</h2>
            <p className="login-card__help">
              {t(
                "Crie sua organização e o primeiro usuário administrador. Depois é possível adicionar outras pessoas com permissões menores. Se o e-mail já possui uma conta, use a senha atual para vincular a nova empresa."
              )}
            </p>

            <form className="login-form" onSubmit={register}>
              <label>
                <span>{t("Nome da organização")}</span>
                <input
                  type="text"
                  name="organizationName"
                  autoComplete="organization"
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                  required
                  minLength={2}
                />
              </label>

              <label>
                <span>{t("Seu nome")}</span>
                <input
                  type="text"
                  name="adminDisplayName"
                  autoComplete="name"
                  value={adminDisplayName}
                  onChange={event => setAdminDisplayName(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>{t("E-mail")}</span>
                <input
                  type="email"
                  name="adminEmail"
                  autoComplete="username"
                  value={adminEmail}
                  onChange={event => setAdminEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>{t("Senha")}</span>
                <input
                  type="password"
                  name="adminPassword"
                  autoComplete="new-password"
                  value={adminPassword}
                  onChange={event => setAdminPassword(event.target.value)}
                  required
                  minLength={12}
                />
              </label>

              <label>
                <span>{t("Confirmar senha")}</span>
                <input
                  type="password"
                  name="adminPasswordConfirm"
                  autoComplete="new-password"
                  value={adminPasswordConfirm}
                  onChange={event =>
                    setAdminPasswordConfirm(event.target.value)
                  }
                  required
                  minLength={12}
                />
              </label>

              {error ? (
                <p className="login-form__error" role="alert">
                  {t(error)}
                </p>
              ) : null}

              <button className="button" type="submit" disabled={submitting}>
                {submitting ? t("Cadastrando...") : t("Criar organização")}
              </button>
            </form>

            <p className="login-card__switch">
              {t("Já tem uma conta?")}{" "}
              <button
                type="button"
                className="login-card__link"
                onClick={() => switchMode("login")}
              >
                {t("Entrar")}
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
