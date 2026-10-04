"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  CreateOrganizationUserInputSchema,
  OrganizationUserResponseSchema,
  UpdateOrganizationMembershipInputSchema,
  MembershipRoleSchema,
  type OrganizationUserResponse,
  type MembershipRole,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
function UserRow({
  user,
  accessToken,
  onChanged,
}: {
  user: OrganizationUserResponse;
  accessToken: string;
  onChanged: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const input = UpdateOrganizationMembershipInputSchema.parse({
        role,
        isActive: active,
      });
      await apiRequest(`/admin/users/${user.membershipId}`, {
        accessToken,
        method: "PATCH",
        body: input,
      });
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível alterar."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="companies-view__card">
      <strong>{user.user.displayName}</strong>
      <p>{user.user.email}</p>
      <fieldset disabled={busy}>
        <legend>Perfil de {user.user.displayName}</legend>
        <label>
          Papel
          <select
            value={role}
            onChange={event => setRole(event.target.value as MembershipRole)}
          >
            {MembershipRoleSchema.options.map(value => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="workspace-checkbox">
          <input
            type="checkbox"
            checked={active}
            onChange={event => setActive(event.target.checked)}
          />
          Vínculo ativo
        </label>
        <button type="button" onClick={() => void save()}>
          Salvar perfil de {user.user.displayName}
        </button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}
export function UsersView({ accessToken }: { accessToken: string }) {
  const [users, setUsers] = useState<OrganizationUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<unknown>("/admin/users", { accessToken })
      .then(payload => {
        const parsed = OrganizationUserResponseSchema.array().parse(payload);
        if (active) setUsers(parsed);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar usuários."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, version]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const parsed = CreateOrganizationUserInputSchema.safeParse(
        Object.fromEntries(data)
      );
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map(issue => issue.message).join(" ")
        );
      await apiRequest("/admin/users", {
        accessToken,
        method: "POST",
        body: parsed.data,
      });
      form.reset();
      setVersion(value => value + 1);
      setNotice("Usuário criado.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar usuário."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="activities-view" aria-labelledby="admin-users-title">
      <h1 id="admin-users-title">Usuários e perfis</h1>
      <p>
        Gerencie os usuários desta organização. As regras de acesso são
        aplicadas pela API.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <form onSubmit={event => void create(event)}>
        <fieldset disabled={busy}>
          <legend>Novo usuário</legend>
          <div className="activity-form__fields">
            <label>
              Nome
              <input name="displayName" required maxLength={160} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Senha inicial
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <label>
              Papel
              <select name="role" defaultValue="VIEWER">
                {MembershipRoleSchema.options.map(role => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit">Criar usuário</button>
        </fieldset>
      </form>
      <button
        type="button"
        disabled={loading}
        onClick={() => setVersion(value => value + 1)}
      >
        Atualizar usuários
      </button>
      {loading ? (
        <p>Carregando usuários...</p>
      ) : (
        <ul className="companies-view__grid">
          {users.map(user => (
            <UserRow
              key={`${user.membershipId}:${version}`}
              user={user}
              accessToken={accessToken}
              onChanged={() => setVersion(value => value + 1)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
