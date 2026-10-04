import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SupportSettingsView } from "./support-settings-view";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("loads queue configuration only when selected", async () => {
  const fetchMock = vi.fn(
    async () =>
      ({ ok: true, status: 200, json: async () => ({ items: [] }) }) as Response
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<SupportSettingsView accessToken="token" />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Filas" }));
  expect(
    await screen.findByRole("button", { name: "Criar fila" })
  ).toBeInTheDocument();
});
