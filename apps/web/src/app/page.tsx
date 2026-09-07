"use client";

import {
  AuthSessionResponseSchema,
  type AuthSessionResponse,
} from "@axes/contracts";
import { FormEvent, useState } from "react";

import { authApiRequest } from "../lib/api-client";
import { CompaniesView } from "./companies/companies-view";
import { ContactsView } from "./contacts/contacts-view";
import { CrmShell, type CrmSection } from "./crm-shell";

export default function Home() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [activeSection, setActiveSection] = useState<CrmSection>("companies");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const payload = await authApiRequest<unknown>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setSession(AuthSessionResponseSchema.parse(payload));
      setActiveSection("companies");
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível autenticar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setError("");
    try {
      await authApiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      setPassword("");
    }
  }

  if (session) {
    return (
      <CrmShell
        session={session}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        onLogout={() => void logout()}
      >
        {activeSection === "companies" ? (
          <CompaniesView accessToken={session.accessToken} />
        ) : (
          <ContactsView accessToken={session.accessToken} />
        )}
      </CrmShell>
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
      </section>
    </main>
  );
}
