import { cleanup, render, screen, fireEvent } from "@testing-library/react";
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
  expect(await screen.findByText("Usuário criado.")).toBeInTheDocument();
  expect(screen.getByLabelText("Senha inicial")).toHaveValue("");
});
