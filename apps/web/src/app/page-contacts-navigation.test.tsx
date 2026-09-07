import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const session = {
  accessToken: "cycle-2-access-token",
  expiresIn: 900,
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@axes.test",
    displayName: "Administrador Axes",
  },
  organization: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Axesistemas",
    slug: "axesistemas",
  },
  membership: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "ADMIN",
  },
  permissions: [
    "company.read",
    "company.write",
    "contact.read",
    "contact.write",
  ],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const emptyContacts = { items: [], page: 1, limit: 20, total: 0 };
const emptyCompanies = { items: [], page: 1, limit: 100, total: 0 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cycle 2 contacts navigation", () => {
  it("opens the real contacts workspace after authentication", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/auth/refresh")) {
        return response({}, 401);
      }
      if (url.endsWith("/auth/login")) {
        return response(session);
      }
      if (url.includes("/contacts?")) {
        return response(emptyContacts);
      }
      if (url.includes("/companies?")) {
        return response(emptyCompanies);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "admin@axes.test" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "example-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));

    const contactsNavigation = await screen.findByRole("button", {
      name: "Contatos",
    });
    fireEvent.click(contactsNavigation);

    expect(
      await screen.findByRole("button", { name: "Novo contato" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "A área de contatos será habilitada na próxima tarefa do Cycle 2."
      )
    ).not.toBeInTheDocument();
  });

  it("restores an authenticated session from the refresh cookie", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/auth/refresh")) {
        return response(session);
      }
      if (url.includes("/companies?")) {
        return response(emptyCompanies);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    expect(
      await screen.findByRole("button", { name: "Contatos" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Entrar no CRM" })
    ).not.toBeInTheDocument();
  });

  it("rotates the refresh token only once under React Strict Mode", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/auth/refresh")) {
        return response(session);
      }
      if (url.includes("/companies?")) {
        return response(emptyCompanies);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <Home />
      </StrictMode>
    );

    expect(
      await screen.findByRole("button", { name: "Contatos" })
    ).toBeInTheDocument();

    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/auth/refresh")
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
