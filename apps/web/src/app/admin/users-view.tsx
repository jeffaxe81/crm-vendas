"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";
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
import { useTranslation } from "../../i18n/language-provider";

function UserRow({
  user,
  accessToken,
  onChanged,
}: {
  user: OrganizationUserResponse;
  accessToken: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const saveFeedback = useSaveFeedback();
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    if (!saveFeedback.start()) return;
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
      saveFeedback.saved();
      onChanged();
    } catch (cause) {
      saveFeedback.failed();
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
        <legend>
          {t("Perfil de ")}
          {user.user.displayName}
        </legend>
        <label>
          {t("Papel")}
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
          {t("Vínculo ativo")}
        </label>
        <SaveButton
          type="button"
          onClick={() => void save()}
          status={saveFeedback.status}
          label={`${t("Salvar perfil de ")}${user.user.displayName}`}
        />
        <SaveNotice status={saveFeedback.status} label={t("Perfil salvo.")} />
      </fieldset>
      {error ? <p role="alert">{t(error)}</p> : null}
    </li>
  );
}
export function UsersView({ accessToken }: { accessToken: string }) {
  return <UsersSessionView key={accessToken} accessToken={accessToken} />;
}

function UsersSessionView({ accessToken }: { accessToken: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const query = normalize(search);
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
  const visibleUsers = users.filter(
    user =>
      (!query ||
        normalize(user.user.displayName).includes(query) ||
        normalize(user.user.email).includes(query)) &&
      (!roleFilter || user.role === roleFilter) &&
      (!statusFilter || user.isActive === (statusFilter === "active"))
  );
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
      setNotice(t("Usuário vinculado à empresa."));
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
      <h1 id="admin-users-title">{t("Usuários e perfis")}</h1>
      <p>
        {t(
          "Gerencie os usuários desta organização. As regras de acesso são aplicadas pela API. Se o e-mail já possui uma conta, ela será vinculada a esta empresa mantendo o nome e a senha existentes. A senha inicial informada será usada somente para contas novas."
        )}
      </p>
      {error ? <p role="alert">{t(error)}</p> : null}
      {notice ? <p role="status">{t(notice)}</p> : null}
      <form onSubmit={event => void create(event)}>
        <fieldset disabled={busy}>
          <legend>{t("Novo usuário")}</legend>
          <div className="activity-form__fields">
            <label>
              {t("Nome")}
              <input name="displayName" required maxLength={160} />
            </label>
            <label>
              {t("E-mail")}
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              {t("Senha inicial")}
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <label>
              {t("Papel")}
              <select name="role" defaultValue="VIEWER">
                {MembershipRoleSchema.options.map(role => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit">{t("Criar usuário")}</button>
        </fieldset>
      </form>
      <button
        type="button"
        disabled={loading}
        onClick={() => setVersion(value => value + 1)}
      >
        {t("Atualizar usuários")}
      </button>
      <fieldset>
        <legend>{t("Filtrar usuários carregados")}</legend>
        <label>
          {t("Buscar usuários carregados")}
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <label>
          {t("Filtrar por perfil")}
          <select
            value={roleFilter}
            onChange={event => setRoleFilter(event.target.value)}
          >
            <option value="">{t("Todos os perfis")}</option>
            {MembershipRoleSchema.options.map(role => (
              <option key={role}>{role}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Filtrar por vínculo")}
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            <option value="">{t("Todos os vínculos")}</option>
            <option value="active">{t("Vínculo ativo")}</option>
            <option value="inactive">{t("Vínculo inativo")}</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setRoleFilter("");
            setStatusFilter("");
          }}
        >
          {t("Limpar filtros")}
        </button>
      </fieldset>
      {loading ? (
        <p>{t("Carregando usuários...")}</p>
      ) : (
        <>
          <p role="status">
            {t("{shown} de {loaded} usuários carregados", {
              shown: visibleUsers.length,
              loaded: users.length,
            })}
          </p>
          {visibleUsers.length === 0 ? (
            <p>
              {t(
                users.length
                  ? "Nenhum usuário corresponde aos filtros."
                  : "Nenhum usuário carregado."
              )}
            </p>
          ) : null}
          <ul className="companies-view__grid">
            {visibleUsers.map(user => (
              <UserRow
                key={`${user.membershipId}:${version}`}
                user={user}
                accessToken={accessToken}
                onChanged={() => setVersion(value => value + 1)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
