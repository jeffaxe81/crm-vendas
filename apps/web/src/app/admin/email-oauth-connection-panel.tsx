"use client";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";
type Provider = "GMAIL" | "MICROSOFT_365";
type Connection = {
  connectionStatus: string;
  version?: number;
  hasEncryptedCredential?: boolean;
};
function EmailOAuthConnectionSession({
  provider,
  accessToken,
}: {
  provider: Provider;
  accessToken: string;
}) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const popup = useRef<Window | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function reload() {
    setConnection(
      await apiRequest<Connection>(`/admin/email/oauth/${provider}/status`, {
        accessToken,
      })
    );
  }
  useEffect(() => {
    let active = true;
    void apiRequest<Connection>(`/admin/email/oauth/${provider}/status`, {
      accessToken,
    })
      .then(value => {
        if (active) setConnection(value);
      })
      .catch(() => {
        if (active) setError(t("Configuração OAuth pendente."));
      });
    return () => {
      active = false;
    };
  }, [accessToken, provider, t]);
  useEffect(() => {
    function callback(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        !popup.current ||
        event.source !== popup.current ||
        event.data?.type !== "crm-email-oauth-callback" ||
        typeof event.data.rawQuery !== "string" ||
        event.data.rawQuery.length > 10000
      )
        return;
      popup.current = null;
      if (timer.current) clearTimeout(timer.current);
      void apiRequest("/admin/email/oauth/callback", {
        method: "POST",
        accessToken,
        body: { rawQuery: event.data.rawQuery },
      })
        .then(reload)
        .catch(() =>
          setError(t("Não foi possível conectar. Inicie uma nova autorização."))
        )
        .finally(() => setBusy(false));
    }
    window.addEventListener("message", callback);
    return () => {
      window.removeEventListener("message", callback);
      popup.current?.close();
      popup.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [accessToken, provider, t]);
  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    popup.current = window.open(
      "about:blank",
      "crm-email-oauth",
      "popup,width=620,height=780"
    );
    if (!popup.current) {
      setBusy(false);
      setError(t("Permita a janela de autorização e tente novamente."));
      return;
    }
    try {
      const result = await apiRequest<{ authorizationUrl: string }>(
        `/admin/email/oauth/${provider}/connect`,
        { method: "POST", accessToken }
      );
      const url = new URL(result.authorizationUrl);
      if (
        url.protocol !== "https:" ||
        !["accounts.google.com", "login.microsoftonline.com"].includes(
          url.hostname
        )
      )
        throw Error();
      popup.current.location.href = url.toString();
      timer.current = setTimeout(() => {
        popup.current?.close();
        popup.current = null;
        setBusy(false);
        setError(t("Não foi possível conectar. Inicie uma nova autorização."));
      }, 5 * 60000);
    } catch {
      popup.current?.close();
      popup.current = null;
      setBusy(false);
      setError(t("Configuração OAuth pendente."));
    }
  }
  async function disconnect() {
    if (!connection?.version || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/admin/email/oauth/${provider}/disconnect`, {
        method: "POST",
        accessToken,
        body: { version: connection.version },
      });
      await reload();
    } catch {
      setError(t("Não foi possível desconectar. Atualize e tente novamente."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={t("Conexão da conta de e-mail")}>
      <h4>{t("Conexão da conta de e-mail")}</h4>
      <p>
        {t(
          connection?.hasEncryptedCredential
            ? "Conta conectada. Envio real desativado."
            : "Conexão pendente de configuração do aplicativo OAuth. Envio real desativado."
        )}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" disabled={busy} onClick={() => void connect()}>
        {t("Conectar conta")}
      </button>
      {connection?.hasEncryptedCredential ? (
        <button type="button" disabled={busy} onClick={() => void disconnect()}>
          {t("Desconectar conta")}
        </button>
      ) : null}
      <p>
        {t(
          "Desconectar remove a credencial deste CRM. O consentimento pode ser revogado nas configurações do provedor."
        )}
      </p>
    </section>
  );
}

export function EmailOAuthConnectionPanel(props: {
  provider: Provider;
  accessToken: string;
}) {
  return (
    <EmailOAuthConnectionSession
      key={`${props.accessToken}:${props.provider}`}
      {...props}
    />
  );
}
