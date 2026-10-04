import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmShell } from "../crm-shell";
const session: any = {
  user: { id: "u", displayName: "Ana" },
  organization: { id: "o", name: "Empresa" },
  membership: { role: "USER" },
  permissions: ["company.read", "activity.read"],
};
afterEach(cleanup);
describe("Grouped workspace navigation", () => {
  it("starts with closed groups and opens related destinations", () => {
    const navigate = vi.fn();
    render(
      <CrmShell
        session={session}
        activeSection={"home" as any}
        onNavigate={navigate}
        onLogout={() => {}}
      >
        Conteúdo
      </CrmShell>
    );
    expect(
      screen.queryByRole("button", { name: "Agenda" })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Grupo Produtividade" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    expect(navigate).toHaveBeenCalledWith("agenda");
    expect(
      screen.queryByRole("button", { name: "Atendimento" })
    ).not.toBeInTheDocument();
  });
  it("hides companies and contacts when permissions are absent", () => {
    render(
      <CrmShell
        session={{ ...session, permissions: [] }}
        activeSection={"home" as any}
        onNavigate={() => {}}
        onLogout={() => {}}
      >
        Conteúdo
      </CrmShell>
    );
    expect(
      screen.queryByRole("button", { name: "Grupo Comercial" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Início" })).toBeInTheDocument();
  });
});
