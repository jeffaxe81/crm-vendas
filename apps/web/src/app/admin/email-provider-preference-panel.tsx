"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type ProviderCode =
  | "NONE"
  | "GMAIL"
  | "MICROSOFT_365"
  | "RESEND"
  | "AMAZON_SES"
  | "SENDGRID"
  | "MAILGUN"
  | "SMTP"
  | "HTTPS_RELAY";

type Preference = {
  version: number;
  providerCode: ProviderCode;
  sendingEnabled: false;
  connectionStatus: "NOT_CONNECTED";
  providers: readonly {
    code: Exclude<ProviderCode, "NONE">;
    label: string;
    authMethod: string;
  }[];
};

/**
 * Only stages an audited preference. OAuth, token storage, test sends and
 * production activation are separate, gated features.
 */
export function EmailProviderPreferencePanel({
  accessToken,
}: {
  accessToken: string;
}) {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<Preference | null>(null);
  const [selected, setSelected] = useState<ProviderCode>("NONE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<Preference>(
        "/admin/email/provider-preference",
        { accessToken }
      );
      setPreference(data);
      setSelected(data.providerCode);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Provedores indisponíveis."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void apiRequest<Preference>("/admin/email/provider-preference", {
      accessToken,
    })
      .then(data => {
        if (active) {
          setPreference(data);
          setSelected(data.providerCode);
        }
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Provedores indisponíveis."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preference || busy || loading) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest<Preference>(
        "/admin/email/provider-preference",
        {
          method: "PUT",
          accessToken,
          body: { version: preference.version, providerCode: selected },
        }
      );
      setPreference(data);
      setSelected(data.providerCode);
      setNotice(
        t("Preferência salva. Conta não conectada e envio desativado.")
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao salvar. Atualize e tente novamente."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="companies-view__card">
      <h3>{t("Provedor de e-mail da empresa")}</h3>
      <p>
        {t(
          "Selecione o serviço que será configurado futuramente. Esta escolha não conecta contas, não solicita senhas e não autoriza envio real."
        )}
      </p>
      {loading ? <p role="status">{t("Carregando provedores...")}</p> : null}
      {error ? (
        <p role="alert">
          {t(error)}{" "}
          <button type="button" onClick={() => void reload()} disabled={busy}>
            {t("Atualizar")}
          </button>
        </p>
      ) : null}
      {notice ? <p role="status">{t(notice)}</p> : null}
      {preference ? (
        <form onSubmit={event => void save(event)}>
          <label htmlFor="email-provider-choice">{t("Provedor")}</label>
          <select
            id="email-provider-choice"
            disabled={busy || loading}
            value={selected}
            onChange={event => setSelected(event.target.value as ProviderCode)}
          >
            <option value="NONE">{t("Nenhum provedor selecionado")}</option>
            {preference.providers.map(provider => (
              <option value={provider.code} key={provider.code}>
                {t(provider.label)}
              </option>
            ))}
          </select>
          <p>
            {t("Autorização:")}{" "}
            {preference.providers.find(item => item.code === selected)
              ?.authMethod ?? t("Não aplicável")}
          </p>
          <p>
            {t("Conexão: Não conectada · Envio: Desativado · Versão:")}{" "}
            {preference.version}
          </p>
          <button
            type="submit"
            disabled={busy || loading || selected === preference.providerCode}
          >
            {busy ? t("Salvando...") : t("Salvar preferência")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
