import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactsView } from "./contacts-view";
const callbacks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("./contact-import-panel", () => ({
  ContactImportPanel: ({ onImported }: { onImported: () => Promise<void> }) => {
    callbacks.push(onImported);
    return null;
  },
}));
const response = (name: string, page = 1) =>
  ({
    ok: true,
    json: async () => ({
      items: name
        ? [{ id: name, fullName: name, updatedAt: "2026-10-01" }]
        : [],
      page,
      limit: 20,
      total: 40,
    }),
  }) as Response;
afterEach(() => {
  cleanup();
  callbacks.length = 0;
  vi.unstubAllGlobals();
});
it("does not let an old import callback invalidate the next session's load", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response("old"))
    .mockResolvedValueOnce(response(""))
    .mockImplementationOnce(
      () =>
        new Promise(resolvePromise => {
          resolve = resolvePromise;
        })
    )
    .mockResolvedValueOnce(response(""));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContactsView accessToken="old" />);
  await screen.findByText("old");
  const oldImport = callbacks[0]!;
  view.rerender(<ContactsView accessToken="new" />);
  await act(async () => oldImport());
  await act(async () => resolve(response("new")));
  expect(screen.getByText("new")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("resets pagination on import and discards the earlier pending page", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response("first"))
    .mockResolvedValueOnce(response(""))
    .mockImplementationOnce(
      () =>
        new Promise(resolvePromise => {
          resolve = resolvePromise;
        })
    )
    .mockResolvedValueOnce(response("refreshed"))
    .mockResolvedValueOnce(response("second", 2));
  vi.stubGlobal("fetch", fetcher);
  render(<ContactsView accessToken="token" />);
  await screen.findByText("first");
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  await act(async () => callbacks[callbacks.length - 1]!());
  await act(async () => resolve(response("late", 2)));
  expect(screen.queryByText("late")).toBeNull();
  expect(screen.queryByText("first")).toBeNull();
  expect(screen.getByText("refreshed")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  await screen.findByText("second");
  expect(fetcher.mock.calls[4]?.[0]).toContain("page=2");
});
