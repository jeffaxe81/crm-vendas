"use client";
import { useEffect, useState, type FormEvent } from "react";
import { LanguageSchema, type LanguageSettings } from "@axes/contracts";
import { useTranslation } from "../../i18n/language-provider";

export function LanguageSettingsView() {
  const { t, settings, loading, error, reload, saveSettings } =
    useTranslation();
  const [draft, setDraft] = useState<LanguageSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(settings);
    setSaved(false);
  }, [settings]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      await saveSettings(draft);
      setSaved(true);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o idioma."
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="companies-view"
      aria-labelledby="language-settings-title"
    >
      <h1 id="language-settings-title">{t("Idioma da aplicação")}</h1>
      <p>{t("Esta configuração se aplica somente a esta empresa.")}</p>
      {loading ? <p role="status">{t("Carregando configuração...")}</p> : null}
      {error ? (
        <p role="alert">
          {t(error)}{" "}
          <button type="button" onClick={reload}>
            {t("Tentar novamente")}
          </button>
        </p>
      ) : null}
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={loading || Boolean(error) || saving}>
          <legend>{t("Preferências de idioma")}</legend>
          <label>
            {t("Idioma padrão")}
            <select
              value={draft.defaultLanguage}
              onChange={event => {
                setDraft(value => ({
                  ...value,
                  defaultLanguage: LanguageSchema.parse(event.target.value),
                }));
                setSaved(false);
              }}
            >
              <option value="pt-BR">Português do Brasil</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.detectBrowserLanguage}
              onChange={event => {
                setDraft(value => ({
                  ...value,
                  detectBrowserLanguage: event.target.checked,
                }));
                setSaved(false);
              }}
            />
            {t("Usar idioma do navegador")}
          </label>
          <p>
            {t(
              "Quando ativado, utiliza inglês ou espanhol conforme o navegador. Para outros idiomas, utiliza Português do Brasil."
            )}
          </p>
          <button type="submit">
            {t(saving ? "Salvando..." : "Salvar configuração")}
          </button>
        </fieldset>
      </form>
      {saveError ? <p role="alert">{t(saveError)}</p> : null}
      {saved ? <p role="status">{t("Configuração de idioma salva.")}</p> : null}
    </section>
  );
}
