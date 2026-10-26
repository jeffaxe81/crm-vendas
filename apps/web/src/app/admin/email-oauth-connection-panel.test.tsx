import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailOAuthConnectionPanel } from "./email-oauth-connection-panel";
import { apiRequest } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("clears connected account state when the authenticated session changes", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({
    hasEncryptedCredential: true,
    version: 7,
  });
  const view = render(
    <EmailOAuthConnectionPanel provider="GMAIL" accessToken="session-a" />
  );
  expect(
    await screen.findByRole("button", { name: "Desconectar conta" })
  ).toBeInTheDocument();
  vi.mocked(apiRequest).mockImplementation(() => new Promise(() => {}));
  view.rerender(
    <EmailOAuthConnectionPanel provider="GMAIL" accessToken="session-b" />
  );
  expect(
    screen.queryByRole("button", { name: "Desconectar conta" })
  ).not.toBeInTheDocument();
});
it("ignores a late status response from the previous provider", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  const view = render(
    <EmailOAuthConnectionPanel provider="GMAIL" accessToken="session-a" />
  );
  vi.mocked(apiRequest).mockResolvedValue({ hasEncryptedCredential: false });
  view.rerender(
    <EmailOAuthConnectionPanel
      provider="MICROSOFT_365"
      accessToken="session-a"
    />
  );
  await act(async () => {
    resolve({ hasEncryptedCredential: true, version: 9 });
  });
  expect(
    screen.queryByRole("button", { name: "Desconectar conta" })
  ).not.toBeInTheDocument();
});
it("shows pending setup without pretending an account is connected", async () => {
  vi.mocked(apiRequest).mockResolvedValue({
    connectionStatus: "PENDING_CLIENT_CONFIG",
    sendingEnabled: false,
  });
  render(
    <EmailOAuthConnectionPanel provider="GMAIL" accessToken="session-a" />
  );
  expect(
    await screen.findByText(/Conexão pendente de configuração/)
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Desconectar conta" })
  ).not.toBeInTheDocument();
});
