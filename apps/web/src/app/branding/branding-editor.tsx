"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";
import { useEffect, useState } from "react";
import {
  defaultBranding,
  TenantBrandingSchema,
  type TenantBranding,
} from "@axes/contracts";
import { brandingStyle } from "./use-tenant-branding";

export function BrandingEditor({
  branding,
  save,
  loading,
}: {
  branding: TenantBranding;
  save: (value: TenantBranding) => Promise<TenantBranding>;
  loading: boolean;
}) {
  const [draft, setDraft] = useState(branding);
  const saveFeedback = useSaveFeedback();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(branding);
  }, [branding]);
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 64 * 1024
    ) {
      setError("Escolha uma imagem PNG ou JPEG de até 64 KB.");
      return;
    }
    setBusy(true);
    try {
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const parsed = TenantBrandingSchema.safeParse({ ...draft, logo });
      if (!parsed.success) throw Error("Imagem inválida. Use PNG ou JPEG.");
      setDraft(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao ler logo.");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    if (!saveFeedback.start()) return;
    try {
      setDraft(await save(draft));
      saveFeedback.saved();
      setMessage("Identidade visual salva para esta empresa.");
    } catch (cause) {
      saveFeedback.failed();
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro ao salvar identidade visual."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="branding-editor" aria-labelledby="branding-title">
      <h2 id="branding-title">Identidade visual da empresa</h2>
      <p>
        Logo e cores são compartilhados com os usuários desta empresa. Este
        navegador lembrará o visual no próximo login.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <SaveNotice
        status={saveFeedback.status}
        label="Identidade visual salva."
      />
      <fieldset disabled={busy || loading}>
        <legend>White-label</legend>
        <label>
          Logo (PNG ou JPEG, até 64 KB)
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={event => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={() => setDraft({ ...draft, logo: "" })}>
          Remover logo
        </button>
        <label>
          Cor principal
          <input
            type="color"
            value={draft.primaryColor}
            onChange={event =>
              setDraft({ ...draft, primaryColor: event.target.value })
            }
          />
        </label>
        <label>
          Cor do menu
          <input
            type="color"
            value={draft.menuColor}
            onChange={event =>
              setDraft({ ...draft, menuColor: event.target.value })
            }
          />
        </label>
        <div
          className="branding-preview"
          style={brandingStyle(draft)}
          aria-label="Prévia da identidade visual"
        >
          {draft.logo ? (
            <img
              className="tenant-logo"
              src={draft.logo}
              alt="Logo da empresa na prévia"
            />
          ) : (
            <strong>Sua empresa</strong>
          )}
          <span className="branding-preview__primary">Cor principal</span>
        </div>
        <p>A prévia só será aplicada à empresa depois de salvar.</p>
        <button
          type="button"
          onClick={() => {
            setDraft({ ...defaultBranding });
            setMessage(
              "Padrão selecionado. Clique em Salvar identidade visual para aplicar."
            );
          }}
        >
          Restaurar identidade padrão
        </button>
        <SaveButton
          type="button"
          onClick={() => void submit()}
          status={saveFeedback.status}
          label="Salvar identidade visual"
        />
      </fieldset>
    </section>
  );
}
