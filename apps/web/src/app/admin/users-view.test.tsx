import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { UsersView } from "./users-view";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads users using the administration endpoint", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [
            {
              membershipId: "11111111-1111-4111-8111-111111111111",
              role: "ADMIN",
              isActive: true,
              user: {
                id: "22222222-2222-4222-8222-222222222222",
                email: "ana@example.test",
                displayName: "Ana",
                isActive: true,
              },
            },
          ],
        }) as Response
    )
  );
  render(<UsersView accessToken="token" />);
  expect(await screen.findByText("ana@example.test")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Criar usuário" })
  ).toBeInTheDocument();
});

it("creates a user with an explicit profile and confirms completion", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: string | URL, init?: RequestInit) =>
        ({
          ok: true,
          status: init?.method === "POST" ? 201 : 200,
          json: async () => [],
        }) as Response
    )
  );
  render(<UsersView accessToken="token" />);
  fireEvent.change(screen.getByLabelText("Nome"), {
    target: { value: "Bruno" },
  });
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "bruno@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha inicial"), {
    target: { value: "Strong-Initial-Password-2026" },
  });
  expect(screen.getByLabelText("Papel")).toHaveValue("VIEWER");
  fireEvent.click(screen.getByRole("button", { name: "Criar usuário" }));
  expect(
    await screen.findByText("Usuário vinculado à empresa.")
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Senha inicial")).toHaveValue("");
});

const loadedUsers = [
  {
    membershipId: "11111111-1111-4111-8111-111111111111",
    role: "ADMIN",
    isActive: true,
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      email: "ana@example.test",
      displayName: "Ána",
      isActive: true,
    },
  },
  {
    membershipId: "33333333-3333-4333-8333-333333333333",
    role: "VIEWER",
    isActive: false,
    user: {
      id: "44444444-4444-4444-8444-444444444444",
      email: "bruno@example.test",
      displayName: "Bruno",
      isActive: true,
    },
  },
];

it("combines local search, role and membership status, then clears without fetching", async () => {
  const fetch = vi.fn(
    async () =>
      ({ ok: true, status: 200, json: async () => loadedUsers }) as Response
  );
  vi.stubGlobal("fetch", fetch);
  render(<UsersView accessToken="token" />);
  await screen.findByText("ana@example.test");
  fireEvent.change(screen.getByLabelText("Buscar usuários carregados"), {
    target: { value: " ANA " },
  });
  expect(screen.getByText("ana@example.test")).toBeInTheDocument();
  expect(screen.queryByText("bruno@example.test")).not.toBeInTheDocument();
  expect(screen.getByText("1 de 2 usuários carregados")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filtrar por perfil"), {
    target: { value: "VIEWER" },
  });
  expect(
    screen.getByText("Nenhum usuário corresponde aos filtros.")
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  fireEvent.change(screen.getByLabelText("Filtrar por vínculo"), {
    target: { value: "inactive" },
  });
  expect(screen.queryByText("ana@example.test")).not.toBeInTheDocument();
  expect(screen.getByText("bruno@example.test")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar usuários carregados"), {
    target: { value: "BRUNO@" },
  });
  expect(screen.getByText("bruno@example.test")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByText("2 de 2 usuários carregados")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves editing and every create profile option while filtering", async () => {
  const fetch = vi.fn(
    async () =>
      ({ ok: true, status: 200, json: async () => loadedUsers }) as Response
  );
  vi.stubGlobal("fetch", fetch);
  render(<UsersView accessToken="token" />);
  await screen.findByText("ana@example.test");
  fireEvent.change(screen.getByLabelText("Filtrar por perfil"), {
    target: { value: "ADMIN" },
  });
  const createRole = screen.getByLabelText("Papel", {
    selector: "select[name=role]",
  });
  expect(
    Array.from((createRole as HTMLSelectElement).options).map(
      option => option.value
    )
  ).toContain("VIEWER");
  fireEvent.click(screen.getByRole("button", { name: "Salvar perfil de Ána" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        call =>
          (call as unknown as [string, RequestInit])[1]?.method === "PATCH"
      )
    ).toBe(true)
  );
});

it("resets filters and clears previous users when the session changes", async () => {
  let resolveNext!: (response: Response) => void;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadedUsers,
    })
    .mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveNext = resolve;
        })
    );
  vi.stubGlobal("fetch", fetch);
  const view = render(<UsersView accessToken="first-session" />);
  await screen.findByText("ana@example.test");
  fireEvent.change(screen.getByLabelText("Buscar usuários carregados"), {
    target: { value: "ana" },
  });
  fireEvent.change(screen.getByLabelText("Filtrar por perfil"), {
    target: { value: "ADMIN" },
  });
  fireEvent.change(screen.getByLabelText("Filtrar por vínculo"), {
    target: { value: "active" },
  });
  view.rerender(<UsersView accessToken="next-session" />);
  expect(screen.getByLabelText("Buscar usuários carregados")).toHaveValue("");
  expect(screen.getByLabelText("Filtrar por perfil")).toHaveValue("");
  expect(screen.getByLabelText("Filtrar por vínculo")).toHaveValue("");
  expect(screen.queryByText("ana@example.test")).not.toBeInTheDocument();
  resolveNext({
    ok: false,
    status: 500,
    json: async () => ({ message: "Falha" }),
  } as Response);
  await screen.findByRole("alert");
  expect(screen.queryByText("ana@example.test")).not.toBeInTheDocument();
});
