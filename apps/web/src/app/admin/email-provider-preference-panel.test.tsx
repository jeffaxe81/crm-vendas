import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailProviderPreferencePanel } from "./email-provider-preference-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("stages Gmail for one company without connecting account or enabling sends", async () => {
  let version = 0;
  let providerCode = "NONE";
  const requests: Array<{ method: string; body?: unknown }> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    requests.push({ method, body });
    if (method === "PUT") {
      providerCode = body.providerCode;
      version++;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        version,
        providerCode,
        sendingEnabled: false,
        connectionStatus: "NOT_CONNECTED",
        providers: [
          { code: "GMAIL", label: "Gmail / Google Workspace", authMethod: "OAUTH2" },
          { code: "MICROSOFT_365", label: "Microsoft 365 / Outlook", authMethod: "OAUTH2" },
        ],
      }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<EmailProviderPreferencePanel accessToken="synthetic-token" />);
  expect(await screen.findByLabelText("Provedor")).toBeInTheDocument();
  expect(screen.getByText(/Conexão: Não conectada/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Provedor"), {
    target: { value: "GMAIL" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar preferência" }));
  expect(await screen.findByText(/Preferência salva/)).toBeInTheDocument();
  expect(requests).toEqual([
    { method: "GET", body: undefined },
    { method: "PUT", body: { version: 0, providerCode: "GMAIL" } },
  ]);
  expect(screen.getByText(/Envio: Desativado/)).toBeInTheDocument();
});
