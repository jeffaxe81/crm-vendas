import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n/language-provider";
import { LanguageSettingsView } from "./language-settings-view";
import { apiRequest } from "../../lib/api-client";
import type { AuthSessionResponse } from "@axes/contracts";
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const session = {
  accessToken: "token",
  organization: { id: "org", slug: "org" },
  user: { id: "user" },
} as AuthSessionResponse;
describe("language administration", () => {
  it("saves the tenant policy with a single-choice language and automatic checkbox", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        defaultLanguage: "pt-BR",
        detectBrowserLanguage: false,
      })
      .mockResolvedValueOnce({
        defaultLanguage: "es",
        detectBrowserLanguage: true,
      });
    render(
      <LanguageProvider session={session}>
        <LanguageSettingsView />
      </LanguageProvider>
    );
    const select = await screen.findByLabelText("Idioma padrão");
    await waitFor(() => expect(select).not.toBeDisabled());
    fireEvent.change(select, { target: { value: "es" } });
    fireEvent.click(screen.getByLabelText("Usar idioma do navegador"));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configuração" })
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/organization/language-settings",
        {
          accessToken: "token",
          method: "PUT",
          body: { defaultLanguage: "es", detectBrowserLanguage: true },
        }
      )
    );
  });
  it("disables saving and allows retry when policy cannot be read", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    render(
      <LanguageProvider session={session}>
        <LanguageSettingsView />
      </LanguageProvider>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    expect(
      screen.getByRole("button", { name: "Salvar configuração" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" })
    ).toBeEnabled();
  });
});
