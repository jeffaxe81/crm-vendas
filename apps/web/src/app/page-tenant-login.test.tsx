import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Home from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("sends the chosen company identifier with the login credentials", async () => {
  let loginBody: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/auth/login"))
        loginBody = JSON.parse(String(init?.body));
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: "Credenciais inválidas" }),
      };
    })
  );
  render(<Home />);
  fireEvent.change(screen.getByLabelText("E-mail"), {
    target: { value: "shared@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Senha"), {
    target: { value: "Original-password-2026!" },
  });
  fireEvent.change(
    screen.getByLabelText("Identificador da empresa (opcional)"),
    { target: { value: "second" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Entrar no CRM" }));
  await waitFor(() =>
    expect(loginBody).toEqual({
      email: "shared@example.test",
      password: "Original-password-2026!",
      organizationSlug: "second",
    })
  );
});
