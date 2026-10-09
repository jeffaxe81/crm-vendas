import { openNavigationGroup } from "./test-utils/workspace-navigation";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { CommunicationProvider } from "./communication/communication-provider";
import { readCommunicationApplication } from "./communication/embedded-application";

const session = {
  accessToken: "test-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "seller@example.test",
    displayName: "Vendedor",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: { id: "33333333-3333-4333-8333-333333333333", role: "SELLER" },
  permissions: ["company.read", "contact.read", "ticket.read"],
};
function mount(
  permissions = session.permissions,
  configured = true,
  authenticated = true,
  mode = "iframe"
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const status =
        url.endsWith("/auth/refresh") && !authenticated ? 401 : 200;
      const body = url.endsWith("/auth/refresh")
        ? { ...session, permissions }
        : url.endsWith("/integrations/neo-communication")
          ? {
              enabled: configured,
              url: "https://neo.example.test/neo/",
              mode,
              height: 800,
              maxWidth: 1600,
            }
          : { items: [], page: 1, limit: 20, total: 0 };
      return { ok: status === 200, status, json: async () => body } as Response;
    })
  );
  render(
    <CommunicationProvider
      configuration={
        configured
          ? readCommunicationApplication({
              NEO_INTERACT_URL: "https://neo.example.test/neo/",
              NEO_INTERACT_MODE: mode,
            })
          : { status: "disabled" }
      }
    >
      <Home />
    </CommunicationProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("NEO communication in CRM navigation", () => {
  it("opens communication through an external link without loading an iframe in tab mode", async () => {
    mount(undefined, true, true, "tab");
    await openNavigationGroup("Atendimento");
    fireEvent.click(
      await screen.findByRole("button", { name: "Comunicação integrada" })
    );
    const link = await screen.findByRole("link", { name: "Abrir em outra aba" });
    expect(link).toHaveAttribute("href", "https://neo.example.test/neo/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
    expect(
      screen.getByText(/configurada para abrir em outra aba/i)
    ).toBeInTheDocument();
  });
  it("starts the iframe only on opening and preserves it across navigation", async () => {
    mount();
    await openNavigationGroup("Atendimento");
    const communication = await screen.findByRole("button", {
      name: "Comunicação integrada",
    });
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
    fireEvent.click(communication);
    const frame = await screen.findByTitle("NEO Interact");
    await openNavigationGroup("Comercial");
    fireEvent.click(screen.getByRole("button", { name: "Empresas" }));
    expect(frame).toBeInTheDocument();
    expect(frame.closest("[hidden]")).not.toBeNull();
    await openNavigationGroup("Atendimento");
    fireEvent.click(
      screen.getByRole("button", { name: "Comunicação integrada" })
    );
    expect(screen.getByTitle("NEO Interact")).toBe(frame);
    expect(frame.closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sair com segurança" }));
    expect(
      await screen.findByRole("heading", { name: "Entrar" })
    ).toBeInTheDocument();
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
  });
  it("opens and collapses a floating panel without remounting the NEO iframe", async () => {
    mount();
    await openNavigationGroup("Atendimento");
    fireEvent.click(
      await screen.findByRole("button", { name: "Comunicação integrada" })
    );
    const iframe = await screen.findByTitle("NEO Interact");
    await openNavigationGroup("Comercial");
    fireEvent.click(screen.getByRole("button", { name: "Empresas" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir comunicação" }));
    expect(screen.getByTitle("NEO Interact")).toBe(iframe);
    expect(iframe.closest("[hidden]")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Recolher painel NEO Interact" })
    );
    expect(iframe.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir comunicação" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Abrir comunicação em tela inteira" })
    );
    expect(screen.getByTitle("NEO Interact")).toBe(iframe);
    expect(iframe.closest("[hidden]")).toBeNull();
  });
  it("does not expose communication to a session without ticket.read", async () => {
    mount(["company.read", "contact.read"]);
    await screen.findByText("Axesistemas");
    expect(
      screen.queryByRole("button", { name: "Comunicação integrada" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
  });
  it("explains missing configuration without rendering any external iframe", async () => {
    mount(undefined, false);
    await openNavigationGroup("Atendimento");
    fireEvent.click(
      await screen.findByRole("button", { name: "Comunicação integrada" })
    );
    expect(
      await screen.findByText("Comunicação ainda não configurada")
    ).toBeInTheDocument();
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
  });
  it("never loads the iframe on the anonymous login page", async () => {
    mount(undefined, true, false);
    expect(
      await screen.findByRole("heading", { name: "Entrar" })
    ).toBeInTheDocument();
    expect(screen.queryByTitle("NEO Interact")).not.toBeInTheDocument();
  });
});
