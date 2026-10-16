import { describe, expect, it } from "vitest";
import {
  LanguageSettingsSchema,
  defaultLanguageSettings,
  resolveLanguage,
} from "./language-settings";

describe("tenant language settings", () => {
  it("defaults to Brazilian Portuguese with automatic detection disabled", () => {
    expect(defaultLanguageSettings).toEqual({
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: false,
    });
  });
  it.each(["en", "es", "pt-BR"])(
    "respects a tenant's manual language %s",
    language => {
      expect(
        resolveLanguage(
          { defaultLanguage: language as "en", detectBrowserLanguage: false },
          ["de-DE"]
        )
      ).toBe(language);
    }
  );
  it.each([
    ["en-US", "en"],
    ["en-GB", "en"],
    ["es-AR", "es"],
    ["es", "es"],
    ["pt-PT", "pt-BR"],
    ["de-DE", "pt-BR"],
    ["", "pt-BR"],
  ])("maps primary browser language %s to %s", (browser, expected) => {
    expect(
      resolveLanguage({ defaultLanguage: "es", detectBrowserLanguage: true }, [
        browser,
        "en-US",
      ])
    ).toBe(expected);
  });
  it("falls back safely without browser preferences", () => {
    expect(
      resolveLanguage(
        { defaultLanguage: "en", detectBrowserLanguage: true },
        []
      )
    ).toBe("pt-BR");
  });
  it.each([
    { defaultLanguage: "fr", detectBrowserLanguage: true },
    { defaultLanguage: "en", detectBrowserLanguage: "true" },
    {
      defaultLanguage: "en",
      detectBrowserLanguage: false,
      organizationId: "other",
    },
    { defaultLanguage: "en" },
  ])("rejects unsupported, ambiguous and tenant-supplied input", input => {
    expect(LanguageSettingsSchema.safeParse(input).success).toBe(false);
  });
});
