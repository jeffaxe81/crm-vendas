import { z } from "zod";

export const LanguageSchema = z.enum(["pt-BR", "en", "es"]);
export type Language = z.infer<typeof LanguageSchema>;
export const LanguageSettingsSchema = z
  .object({
    defaultLanguage: LanguageSchema,
    detectBrowserLanguage: z.boolean(),
  })
  .strict();
export type LanguageSettings = z.infer<typeof LanguageSettingsSchema>;
export const defaultLanguageSettings: Readonly<LanguageSettings> =
  Object.freeze({
    defaultLanguage: "pt-BR",
    detectBrowserLanguage: false,
  });

/** Only the primary browser preference applies; unsupported languages use pt-BR. */
export function resolveLanguage(
  settings: LanguageSettings,
  browserLanguages: readonly string[] = []
): Language {
  if (!settings.detectBrowserLanguage) return settings.defaultLanguage;
  const language = browserLanguages[0]?.toLowerCase().split("-")[0];
  return language === "en" || language === "es" ? language : "pt-BR";
}
