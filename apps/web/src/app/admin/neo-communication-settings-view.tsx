"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api-client";

export type NeoSettings = {
  enabled: boolean;
  url: string;
  mode: "iframe" | "tab";
  height: number;
  maxWidth: number;
};

export const defaultNeoSettings: NeoSettings = {
  enabled: false,
  url: "",
  mode: "tab",
  height: 800,
  maxWidth: 1600,
};

export function NeoCommunicationSettingsView({
  accessToken,
  canManage,
}: {
  accessToken: string;
  canManage: boolean;
}) {
  const [settings, setSettings] = useState<NeoSettings>(defaultNeoSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void apiRequest<NeoSettings>("/integrations/neo-communication", {
      accessToken,
    })
      .then(result => {
        if (active) setSettings(result);
      })
      .catch(() => {
        if (active) setError("Não foi possível consultar a configuração NEO.");
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
    if (!canManage || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await apiRequest("/integrations/neo-communication", {
        accessToken,
        method: "PUT",
        body: settings,
      });
      setNotice("Configuração NEO salva para esta organização.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao salvar configuração NEO."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-labelledby="neo-settings-title"
    >
      <h2 id="neo-settings-title">Comunicação — NEO Interact</h2>
      <p>
        Configuração por organização. A incorporação por iframe exige
        autorização no ambiente NEO.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {loading ? (
        <p role="status">Carregando configuração NEO...</p>
      ) : (
        <form className="activity-form" onSubmit={event => void save(event)}>
          <fieldset disabled={!canManage || busy}>
            <legend>Configuração da integração</legend>
            <label className="workspace-checkbox">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={event =>
                  setSettings(value => ({
                    ...value,
                    enabled: event.target.checked,
                  }))
                }
              />
              Habilitar NEO Interact
            </label>
            <label>
              URL HTTPS do NEO
              <input
                type="url"
                value={settings.url}
                placeholder="https://neo.exemplo.com/neo/"
                required={settings.enabled}
                onChange={event =>
                  setSettings(value => ({ ...value, url: event.target.value }))
                }
              />
            </label>
            <label>
              Modo de abertura
              <select
                value={settings.mode}
                onChange={event =>
                  setSettings(value => ({
                    ...value,
                    mode: event.target.value as NeoSettings["mode"],
                  }))
                }
              >
                <option value="iframe">Painel integrado (iframe)</option>
                <option value="tab">Nova aba</option>
              </select>
            </label>
            <label>
              Altura do iframe (320 a 1600 px)
              <input
                type="number"
                min={320}
                max={1600}
                value={settings.height}
                onChange={event =>
                  setSettings(value => ({
                    ...value,
                    height: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Largura máxima (320 a 1600 px)
              <input
                type="number"
                min={320}
                max={1600}
                value={settings.maxWidth}
                onChange={event =>
                  setSettings(value => ({
                    ...value,
                    maxWidth: Number(event.target.value),
                  }))
                }
              />
            </label>
            <button className="button" type="submit" disabled={busy}>
              Salvar configuração
            </button>
          </fieldset>
        </form>
      )}
      {!canManage ? (
        <p>Seu perfil possui acesso de leitura à configuração.</p>
      ) : null}
    </section>
  );
}
