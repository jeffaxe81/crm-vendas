import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthSessionResponse } from "@axes/contracts";
import { LanguageProvider } from "./language-provider";
import { CrmShell } from "../app/crm-shell";
import { apiRequest } from "../lib/api-client";
vi.mock("../lib/api-client", () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const session = {
  accessToken: "token",
  organization: { id: "org", slug: "org", name: "Empresas" },
  user: { id: "user", displayName: "Salvar", email: "user@example.test" },
  membership: { role: "ADMIN" },
  permissions: ["company.read", "organization.manage"],
} as AuthSessionResponse;
describe("translated CRM shell", () => {
  it.each([
    ["en", "Companies", "Application language"],
    ["es", "Empresas", "Idioma de la aplicación"],
  ])(
    "renders navigation in %s without translating customer names",
    async (language, companies, settings) => {
      vi.mocked(apiRequest).mockResolvedValue({
        defaultLanguage: language,
        detectBrowserLanguage: false,
      });
      render(
        <LanguageProvider session={session}>
          <CrmShell
            session={session}
            activeSection="language-settings"
            onNavigate={vi.fn()}
            onLogout={vi.fn()}
          >
            <p>customer content</p>
          </CrmShell>
        </LanguageProvider>
      );
      expect(
        await screen.findByRole("button", { name: companies })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: settings })
      ).toBeInTheDocument();
      expect(screen.getByText("Salvar")).toBeInTheDocument();
      expect(
        screen.getByText("Empresas", { selector: "strong" })
      ).toBeInTheDocument();
    }
  );
});
