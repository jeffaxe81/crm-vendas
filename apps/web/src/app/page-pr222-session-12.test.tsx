import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import Home from "./page";
import { SESSION_UNAUTHORIZED_EVENT } from "../lib/api-client";
vi.mock("./crm-shell", () => ({
  CrmShell: ({
    children,
    session,
  }: {
    children: ReactNode;
    session: { accessToken: string };
  }) => (
    <div>
      <output aria-label="Sessão atual">{session.accessToken}</output>
      {children}
    </div>
  ),
}));
vi.mock("./branding/use-tenant-branding", () => ({
  useTenantBranding: () => ({ branding: {} }),
  brandingStyle: () => ({}),
}));
vi.mock("./workspace/workspace-provider", () => ({
  WorkspaceProvider: ({ children }: { children: ReactNode }) => children,
  useWorkspace: () => null,
}));

vi.mock("./workspace/workspace-home", () => ({
  WorkspaceHome: () => <p>Home pronta</p>,
}));

vi.mock("./workspace/first-access-experience", () => ({
  FirstAccessExperience: () => null,
}));

vi.mock("./workspace/quick-setup-experience", () => ({
  QuickSetupExperience: ({ openToken }: { openToken: number }) => (
    <output aria-label="Token da configuração rápida">{openToken}</output>
  ),
}));

const session = {
  accessToken: "quick-page-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.test",
    displayName: "Admin",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Empresa Demo",
    slug: "empresa-demo",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
  },
  permissions: ["organization.manage", "user.manage", "company.read"],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const scenarios = [60, 900, 3600].flatMap(ttl =>
  ["renew", "reject", "tenant-change", "old-response"].map(outcome => ({
    ttl,
    outcome,
  }))
);
describe("PR222: 12 session lifecycle cases", () => {
  it.each(scenarios)("TTL $ttl — $outcome", async ({ ttl, outcome }) => {
    vi.useFakeTimers();
    const loggedIn = { ...session, expiresIn: ttl };
    let refreshCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/login")) return response(loggedIn);
        if (url.endsWith("/auth/refresh")) {
          refreshCount++;
          if (refreshCount === 1 || outcome === "reject")
            return response({}, 401);
          return response({
            ...loggedIn,
            accessToken: "renewed-token",
            organization:
              outcome === "tenant-change"
                ? {
                    ...session.organization,
                    id: "44444444-4444-4444-8444-444444444444",
                  }
                : session.organization,
          });
        }
        return response({});
      })
    );
    render(<Home />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: session.user.email },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "synthetic-password" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));
    });
    expect(screen.getByLabelText("Sessão atual")).toHaveTextContent(
      loggedIn.accessToken
    );
    if (outcome === "old-response") {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(SESSION_UNAUTHORIZED_EVENT, { detail: "older-token" })
        );
      });
      expect(screen.getByLabelText("Sessão atual")).toBeInTheDocument();
      act(() => {
        window.dispatchEvent(
          new CustomEvent(SESSION_UNAUTHORIZED_EVENT, {
            detail: loggedIn.accessToken,
          })
        );
      });
      expect(
        screen.getByRole("button", { name: "Entrar no CRM" })
      ).toBeInTheDocument();
      return;
    }
    await act(async () => {
      vi.advanceTimersByTime(ttl * 800 - 1);
    });
    expect(refreshCount).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(refreshCount).toBe(2);
    if (outcome === "renew")
      expect(screen.getByLabelText("Sessão atual")).toHaveTextContent(
        "renewed-token"
      );
    else {
      expect(screen.queryByLabelText("Sessão atual")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Sua sessão expirou ou foi invalidada"
      );
    }
  });
});
