import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LanguageProvider, useTranslation } from "./language-provider";
import { apiRequest } from "../lib/api-client";
import type { AuthSessionResponse } from "@axes/contracts";
vi.mock("../lib/api-client", () => ({ apiRequest: vi.fn() }));
const session = (id: string) =>
  ({
    organization: { id, slug: id },
    user: { id: "user" },
    accessToken: id,
  }) as AuthSessionResponse;
function Probe() {
  const { t, locale, saveSettings, loading, error } = useTranslation();
  return (
    <>
      <p>{locale}</p>
      <p>{t("Empresas")}</p>
      <p>{loading ? "loading" : "loaded"}</p>
      <p>{error}</p>
      <button
        onClick={() =>
          void saveSettings({
            defaultLanguage: "es",
            detectBrowserLanguage: false,
          })
        }
      >
        save
      </button>
    </>
  );
}
describe("tenant language provider", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.lang = "pt-BR";
  });
  it("uses the tenant manual language and updates the document", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      defaultLanguage: "en",
      detectBrowserLanguage: false,
    });
    render(
      <LanguageProvider session={session("a")}>
        <Probe />
      </LanguageProvider>
    );
    expect(await screen.findByText("Companies")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(JSON.parse(localStorage.getItem("axes-crm-language:a")!)).toEqual({
      defaultLanguage: "en",
      detectBrowserLanguage: false,
    });
  });
  it("follows browser changes only while automatic detection is enabled", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-MX"]);
    vi.mocked(apiRequest).mockResolvedValue({
      defaultLanguage: "pt-BR",
      detectBrowserLanguage: true,
    });
    render(
      <LanguageProvider session={session("a")}>
        <Probe />
      </LanguageProvider>
    );
    expect(await screen.findByText("Empresas")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    fireEvent(window, new Event("languagechange"));
    expect(await screen.findByText("Companies")).toBeInTheDocument();
  });
  it("does not apply delayed requests from an earlier tenant", async () => {
    let resolveA!: (value: unknown) => void;
    vi.mocked(apiRequest).mockImplementation((_path, options) =>
      options?.accessToken === "a"
        ? new Promise(resolve => {
            resolveA = resolve;
          })
        : Promise.resolve({
            defaultLanguage: "es",
            detectBrowserLanguage: false,
          })
    );
    const view = render(
      <LanguageProvider session={session("a")}>
        <Probe />
      </LanguageProvider>
    );
    view.rerender(
      <LanguageProvider session={session("b")}>
        <Probe />
      </LanguageProvider>
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
    resolveA({ defaultLanguage: "en", detectBrowserLanguage: false });
    await waitFor(() => expect(screen.getByText("es")).toBeInTheDocument());
    expect(document.documentElement.lang).toBe("es");
  });
  it("updates the locale immediately after a successful save", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        defaultLanguage: "en",
        detectBrowserLanguage: false,
      })
      .mockResolvedValueOnce({
        defaultLanguage: "es",
        detectBrowserLanguage: false,
      });
    render(
      <LanguageProvider session={session("a")}>
        <Probe />
      </LanguageProvider>
    );
    await screen.findByText("Companies");
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
  });
  it("keeps first access Portuguese and only recalls policy for an identified tenant", async () => {
    localStorage.setItem(
      "axes-crm-language:a",
      JSON.stringify({ defaultLanguage: "en", detectBrowserLanguage: false })
    );
    const view = render(
      <LanguageProvider session={null}>
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByText("pt-BR")).toBeInTheDocument();
    view.rerender(
      <LanguageProvider session={null} loginSlug="a">
        <Probe />
      </LanguageProvider>
    );
    await screen.findByText("Companies");
    view.rerender(
      <LanguageProvider session={null} loginSlug="b">
        <Probe />
      </LanguageProvider>
    );
    await screen.findByText("pt-BR");
  });
  it("exposes read failure instead of treating defaults as a loaded tenant policy", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    render(
      <LanguageProvider session={session("a")}>
        <Probe />
      </LanguageProvider>
    );
    expect(await screen.findByText("offline")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("pt-BR");
  });
});
