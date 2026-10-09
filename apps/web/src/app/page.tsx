"use client";

import {
  AuthSessionResponseSchema,
  availableWorkspaceDestinations,
  type AuthSessionResponse,
} from "@axes/contracts";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Headset, PanelRightClose, PanelRightOpen } from "lucide-react";

import { authApiRequest } from "../lib/api-client";
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
import { UsersView } from "./admin/users-view";
import { SupportSettingsView } from "./admin/support-settings-view";
import { IntegrationCredentialsView } from "./admin/integration-credentials-view";

export default function Home() {
  const manualNavigation = useRef(false);
  const [reportTab, setReportTab] = useState<ReportTab>("summary");
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
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

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = await authApiRequest<unknown>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      manualNavigation.current = false;
      setSession(AuthSessionResponseSchema.parse(payload));
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
      setError("As senhas não coincidem.");
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
      setCommunicationOpened(false);
      setCommunicationDockOpen(false);
      setPassword("");
    }
  }

  function navigate(section: CrmSection) {
    if (
      !session ||
      !availableWorkspaceDestinations(session.permissions).some(
        item => item.id === section
      )
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
          session={session}
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
            <WorkspaceEditor session={session} />
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
              permissions={session.permissions}
            />
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
                  {communicationDockOpen ? "Recolher comunicação" : "Abrir comunicação"}
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
                hidden={activeSection !== "communication" && !communicationDockOpen}
              >
                {activeSection !== "communication" && communicationDockOpen ? (
                  <div className="communication-dock__toolbar">
                    <strong>NEO Interact</strong>
                    <button
                      type="button"
                      onClick={() => setCommunicationDockOpen(false)}
                      aria-label="Recolher painel NEO Interact"
                    >
                      <PanelRightClose aria-hidden="true" />
                      Recolher
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("communication")}
                      aria-label="Abrir comunicação em tela inteira"
                    >
                      <PanelRightOpen aria-hidden="true" />
                      Expandir
                    </button>
                  </div>
                ) : null}
                <CommunicationView accessToken={session.accessToken} />
              </div>
            </>
          ) : null}
        </CrmShell>
      </WorkspaceProvider>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-brand" aria-labelledby="crm-title">
        <p className="login-brand__eyebrow">Axesistemas</p>
        <h1 id="crm-title">CRM Axesistemas</h1>
        <p className="login-brand__lead">
          Relacionamento e vendas em uma base segura, preparada para
          organizações independentes.
        </p>
        <div className="login-brand__status">
          <span aria-hidden="true">●</span>
          Ciclo 2 — CRM Core
        </div>
      </section>

      <section className="login-card" aria-label="Acesso ao CRM">
        {mode === "login" ? (
          <>
            <p className="login-card__eyebrow">Acesso seguro</p>
            <h2>Entrar</h2>
            <p className="login-card__help">
              Use seu e-mail e senha cadastrados na organização.
            </p>

            <form className="login-form" onSubmit={login}>
              <label>
                <span>E-mail</span>
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
                <span>Senha</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                />
              </label>

              {error ? (
                <p className="login-form__error" role="alert">
                  {error}
                </p>
              ) : null}

              <button className="button" type="submit" disabled={submitting}>
                {submitting ? "Autenticando..." : "Entrar no CRM"}
              </button>
            </form>

            <p className="login-card__security">
              O refresh token permanece protegido em cookie HttpOnly e não é
              armazenado pela interface.
            </p>

            <p className="login-card__switch">
              Ainda não tem uma organização cadastrada?{" "}
              <button
                type="button"
                className="login-card__link"
                onClick={() => switchMode("register")}
              >
                Cadastre-se
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="login-card__eyebrow">Primeiro acesso</p>
            <h2>Cadastrar organização</h2>
            <p className="login-card__help">
              Crie sua organização e o primeiro usuário administrador. Depois é
              possível adicionar outras pessoas com permissões menores.
            </p>

            <form className="login-form" onSubmit={register}>
              <label>
                <span>Nome da organização</span>
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
                <span>Seu nome</span>
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
                <span>E-mail</span>
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
                <span>Senha</span>
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
                <span>Confirmar senha</span>
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
                  {error}
                </p>
              ) : null}

              <button className="button" type="submit" disabled={submitting}>
                {submitting ? "Cadastrando..." : "Criar organização"}
              </button>
            </form>

            <p className="login-card__switch">
              Já tem uma conta?{" "}
              <button
                type="button"
                className="login-card__link"
                onClick={() => switchMode("login")}
              >
                Entrar
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
