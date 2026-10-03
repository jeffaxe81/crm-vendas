import type { AuthSessionResponse } from "@axes/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrmShell } from "./crm-shell";

const session = {
  accessToken: "test-token",
  expiresIn: 900,
  user: {
    id: "user",
    email: "vendedor@example.test",
    displayName: "Ana Comercial",
  },
  organization: { id: "org", name: "Equipe Axesistemas", slug: "axesistemas" },
  membership: { id: "member", role: "SELLER" },
  permissions: ["company.read", "contact.read", "activity.read"],
} as AuthSessionResponse;

function viewport(mobile: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = {
    matches: mobile,
    addEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void
    ) => listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void
    ) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", () => media);
  return (next: boolean) => {
    media.matches = next;
    listeners.forEach(listener => listener({ matches: next }));
  };
}

function mount() {
  const onNavigate = vi.fn();
  const onLogout = vi.fn();
  render(
    <CrmShell
      session={session}
      activeSection="companies"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <h1>Cadastro de empresas</h1>
    </CrmShell>
  );
  return { onNavigate, onLogout };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Dispatch navigation in CRM", () => {
  it("collapses the desktop navigation and remembers the preference", () => {
    viewport(false);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Recolher navegação" }));
    expect(
      screen.getByRole("button", { name: "Expandir navegação" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("axes-crm-sidebar-collapsed")).toBe("true");
    cleanup();
    mount();
    expect(
      screen.getByRole("button", { name: "Expandir navegação" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Empresas" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("opens mobile navigation and closes it when choosing a permitted section", () => {
    viewport(true);
    const { onNavigate } = mount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    const dialog = screen.getByRole("dialog", { name: "Navegação do CRM" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).queryByRole("button", { name: "Oportunidades" })
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Contatos" }));
    expect(onNavigate).toHaveBeenCalledWith("contacts");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir navegação" })
    ).toHaveFocus();
  });

  it("traps keyboard focus in the drawer and returns focus on Escape", () => {
    viewport(true);
    mount();
    const trigger = screen.getByRole("button", { name: "Abrir navegação" });
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Fechar navegação" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(
      screen.getByRole("button", { name: "Sair com segurança" })
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("dismisses the mobile drawer when the viewport becomes desktop", () => {
    const resize = viewport(true);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Abrir navegação" }));
    act(() => resize(false));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recolher navegação" })
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
