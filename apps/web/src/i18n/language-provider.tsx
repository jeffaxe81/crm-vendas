"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LanguageSettingsSchema,
  defaultLanguageSettings,
  resolveLanguage,
  type AuthSessionResponse,
  type LanguageSettings,
  type Language,
} from "@axes/contracts";
import { apiRequest } from "../lib/api-client";
import { translate } from "./messages";

type State = {
  scope: string;
  settings: LanguageSettings;
  loaded: boolean;
  error: string;
};
type LanguageContext = {
  locale: Language;
  t: (
    message: string | undefined,
    values?: Record<string, string | number | undefined>
  ) => string;
  settings: LanguageSettings;
  loading: boolean;
  error: string;
  reload: () => void;
  saveSettings: (settings: LanguageSettings) => Promise<void>;
};
const fallback: LanguageContext = {
  locale: "pt-BR",
  t: (message, values) => translate("pt-BR", message, values),
  settings: defaultLanguageSettings,
  loading: false,
  error: "",
  reload: () => {},
  saveSettings: async () => {
    throw new Error("Sessão indisponível.");
  },
};
const Context = createContext<LanguageContext>(fallback);
const cacheKey = (slug: string) =>
  `axes-crm-language:${slug.trim().toLowerCase()}`;
function remember(slug: string, settings: LanguageSettings) {
  try {
    localStorage.setItem(cacheKey(slug), JSON.stringify(settings));
  } catch {
    /* Storage is optional. */
  }
}
function recall(slug: string): LanguageSettings {
  try {
    const value = LanguageSettingsSchema.safeParse(
      JSON.parse(localStorage.getItem(cacheKey(slug)) ?? "null")
    );
    if (value.success) return value.data;
  } catch {
    /* Corrupt or unavailable storage uses Portuguese. */
  }
  return defaultLanguageSettings;
}
function browserLanguages(): readonly string[] {
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
}

export function LanguageProvider({
  session,
  loginSlug = "",
  children,
}: {
  session: AuthSessionResponse | null;
  loginSlug?: string;
  children: ReactNode;
}) {
  const scope = session
    ? `${session.organization.id}:${session.user.id}:${session.accessToken}`
    : `login:${loginSlug.trim().toLowerCase()}`;
  const [state, setState] = useState<State>({
    scope: "",
    settings: defaultLanguageSettings,
    loaded: false,
    error: "",
  });
  const [languages, setLanguages] = useState<readonly string[]>([]);
  const [revision, setRevision] = useState(0);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const accessToken = session?.accessToken;
  const slug = session?.organization.slug ?? loginSlug;

  useEffect(() => {
    const update = () => setLanguages(browserLanguages());
    update();
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);

  useEffect(() => {
    const request = ++generation.current;
    let active = true;
    if (!accessToken) {
      setState({
        scope,
        settings: slug ? recall(slug) : defaultLanguageSettings,
        loaded: true,
        error: "",
      });
      return () => {
        active = false;
      };
    }
    setState({
      scope,
      settings: defaultLanguageSettings,
      loaded: false,
      error: "",
    });
    void apiRequest<unknown>("/organization/language-settings", { accessToken })
      .then(payload => {
        const settings = LanguageSettingsSchema.parse(payload);
        if (
          !active ||
          request !== generation.current ||
          currentScope.current !== scope
        )
          return;
        remember(slug, settings);
        setState({ scope, settings, loaded: true, error: "" });
      })
      .catch(cause => {
        if (
          active &&
          request === generation.current &&
          currentScope.current === scope
        )
          setState({
            scope,
            settings: defaultLanguageSettings,
            loaded: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar o idioma.",
          });
      });
    return () => {
      active = false;
    };
  }, [scope, accessToken, slug, revision]);

  const settings =
    state.scope === scope ? state.settings : defaultLanguageSettings;
  const locale = resolveLanguage(settings, languages);
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = "pt-BR";
    };
  }, [locale]);

  const saveSettings = useCallback(
    async (input: LanguageSettings) => {
      if (!accessToken || state.scope !== scope || !state.loaded)
        throw new Error("Configuração de idioma indisponível.");
      const payload = await apiRequest<unknown>(
        "/organization/language-settings",
        {
          accessToken,
          method: "PUT",
          body: LanguageSettingsSchema.parse(input),
        }
      );
      const saved = LanguageSettingsSchema.parse(payload);
      if (currentScope.current !== scope) return;
      ++generation.current;
      remember(slug, saved);
      setState({ scope, settings: saved, loaded: true, error: "" });
    },
    [accessToken, scope, slug, state.scope, state.loaded]
  );
  const t = useCallback(
    (
      message: string | undefined,
      values?: Record<string, string | number | undefined>
    ) => translate(locale, message, values),
    [locale]
  );
  const value = useMemo(
    () => ({
      locale,
      t,
      settings,
      loading: state.scope !== scope || (!state.loaded && !state.error),
      error: state.scope === scope ? state.error : "",
      reload: () => setRevision(value => value + 1),
      saveSettings,
    }),
    [locale, t, settings, state, scope, saveSettings]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTranslation() {
  return useContext(Context);
}
