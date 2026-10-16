import type { Language } from "@axes/contracts";

import en from "./catalogs/en.json";
import es from "./catalogs/es.json";
export const catalogs: Record<"en" | "es", Record<string, string>> = { en, es };

export function translate(
  locale: Language,
  message: string | undefined,
  values: Record<string, string | number | undefined> = {}
): string {
  if (message === undefined) return "";
  const key = message.trim();
  const translated =
    locale === "pt-BR"
      ? key
      : Object.prototype.hasOwnProperty.call(catalogs[locale], key)
        ? catalogs[locale][key]!
        : key;
  const template = key ? message.replace(key, () => translated) : message;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : match
  );
}
