"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  WorkspacePreferencesSchema,
  createDefaultWorkspacePreferences,
  sanitizeWorkspacePreferences,
  type WorkspacePreferences,
  type AuthSessionResponse,
} from "@axes/contracts";
import { apiRequest } from "../../lib/api-client";
import { useTranslation } from "../../i18n/language-provider";

type WorkspaceState = {
  saved: WorkspacePreferences;
  draft: WorkspacePreferences;
  setDraft: (value: WorkspacePreferences) => void;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  save: () => Promise<boolean>;
  restoreDefaults: () => void;
};
const Context = createContext<WorkspaceState | null>(null);
export function useWorkspace() {
  return useContext(Context);
}
export function WorkspaceProvider({
  session,
  onInitialPreferences,
  children,
}: {
  session: AuthSessionResponse;
  onInitialPreferences?: (value: WorkspacePreferences) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(createDefaultWorkspacePreferences);
  const [draft, setDraft] = useState(createDefaultWorkspacePreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const callback = useRef(onInitialPreferences);
  callback.current = onInitialPreferences;
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setSaving(false);
    setError("");
    setMessage("");
    setSaved(createDefaultWorkspacePreferences());
    setDraft(createDefaultWorkspacePreferences());
    void apiRequest<unknown>("/me/workspace-preferences", {
      accessToken: session.accessToken,
    })
      .then(payload => {
        const value = sanitizeWorkspacePreferences(
          WorkspacePreferencesSchema.parse(payload),
          session.permissions
        );
        if (generation.current !== current) return;
        setSaved(value);
        setDraft(value);
        callback.current?.(value);
      })
      .catch(cause => {
        if (generation.current === current)
          setError(
            t("Preferências indisponíveis; usando padrão. {0}", {
              0:
                cause instanceof Error
                  ? cause.message
                  : "Tente novamente mais tarde.",
            })
          );
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [
    session.accessToken,
    session.user.id,
    session.organization.id,
    session.permissions,
  ]);
  async function save() {
    if (saving || loading) return false;
    const current = generation.current;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const input = WorkspacePreferencesSchema.parse(
        sanitizeWorkspacePreferences(draft, session.permissions)
      );
      const payload = await apiRequest<unknown>("/me/workspace-preferences", {
        accessToken: session.accessToken,
        method: "PUT",
        body: input,
      });
      const value = sanitizeWorkspacePreferences(
        WorkspacePreferencesSchema.parse(payload),
        session.permissions
      );
      if (generation.current === current) {
        setSaved(value);
        setDraft(value);
        setMessage(t("Preferências salvas para este usuário e organização."));
        return true;
      }
    } catch (cause) {
      if (generation.current === current)
        setError(
          cause instanceof Error ? cause.message : "Não foi possível salvar."
        );
    } finally {
      if (generation.current === current) setSaving(false);
    }
    return false;
  }
  return (
    <Context.Provider
      value={{
        saved,
        draft,
        setDraft: value => {
          setDraft(value);
          setMessage("");
        },
        loading,
        saving,
        error,
        message,
        save,
        restoreDefaults: () => {
          setDraft(createDefaultWorkspacePreferences());
          setMessage(
            t("Padrão restaurado no rascunho; clique Salvar preferências.")
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
