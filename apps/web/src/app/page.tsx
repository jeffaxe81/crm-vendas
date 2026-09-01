"use client";

import {
  AuthSessionResponseSchema,
  type AuthSessionResponse,
} from "@axes/contracts";
import { FormEvent, useState } from "react";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

type ApiError = {
  message?: string;
};

export default function Home() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const apiError = payload as ApiError;
        throw new Error(apiError.message ?? "Não foi possível autenticar.");
      }

      setSession(AuthSessionResponseSchema.parse(payload));
      setPassword("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível autenticar."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setError("");
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          "x-request-id": crypto.randomUUID(),
        },
      });
    } finally {
      setSession(null);
      setPassword("");
    }
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
          Ciclo 1 — Identidade e acesso
        </div>
      </section>

      <section className="login-card" aria-label="Acesso ao CRM">
        {session ? (
          <div className="session-card">
            <p className="login-card__eyebrow">Sessão ativa</p>
            <h2>{session.user.displayName}</h2>
            <dl className="session-card__details">
              <div>
                <dt>Organização</dt>
                <dd>{session.organization.name}</dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>{session.membership.role}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{session.user.email}</dd>
              </div>
            </dl>
            <button className="button button--secondary" onClick={logout}>
              Sair com segurança
            </button>
          </div>
        ) : (
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
          </>
        )}
      </section>
    </main>
  );
}
