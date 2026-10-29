import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ContactsView } from "./contacts-view";

const contact = (id: string) => ({
  id,
  fullName: `Person ${id}`,
  updatedAt: "2026-10-01",
  channels: [],
});
const response = (items: unknown[], page = 1, total = 40) =>
  ({
    ok: true,
    json: async () => ({ items, page, limit: 20, total }),
  }) as Response;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("appends authenticated pages, deduplicates IDs and lets read-only users load more", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response([contact("one")]))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response([contact("one"), contact("two")], 2));
  vi.stubGlobal("fetch", fetcher);
  render(<ContactsView accessToken="token" canWrite={false} />);
  await screen.findByText("Person one");
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  await screen.findByText("Person two");
  expect(screen.getAllByText("Person one")).toHaveLength(1);
  expect(fetcher).toHaveBeenLastCalledWith(
    expect.stringContaining("/contacts?page=2&limit=20"),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    })
  );
  expect(screen.queryByRole("button", { name: "Novo contato" })).toBeNull();
});

it("retains contacts on failure and retries the same page without concurrent requests", async () => {
  let reject!: (reason: Error) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response([contact("one")]))
    .mockResolvedValueOnce(response([]))
    .mockImplementationOnce(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise;
        })
    )
    .mockResolvedValueOnce(response([contact("two")], 2));
  vi.stubGlobal("fetch", fetcher);
  render(<ContactsView accessToken="token" />);
  await screen.findByText("Person one");
  const more = screen.getByRole("button", { name: "Carregar mais contatos" });
  fireEvent.click(more);
  fireEvent.click(more);
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () => reject(new Error("Unavailable")));
  expect(screen.getByText("Person one")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  await screen.findByText("Person two");
  expect(fetcher.mock.calls[3]?.[0]).toContain("page=2");
});

it("ignores a late page when the session changes", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response([contact("one")]))
    .mockResolvedValueOnce(response([]))
    .mockImplementationOnce(
      () =>
        new Promise(resolvePromise => {
          resolve = resolvePromise;
        })
    )
    .mockResolvedValueOnce(response([contact("new")]))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ContactsView accessToken="old" />);
  await screen.findByText("Person one");
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  view.rerender(<ContactsView accessToken="new" />);
  await screen.findByText("Person new");
  await act(async () => resolve(response([contact("late")], 2)));
  expect(screen.queryByText("Person late")).toBeNull();
  expect(screen.queryByText("Person one")).toBeNull();
});

it("discards a pending page after local filter changes and retries that page", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response([contact("one")]))
    .mockResolvedValueOnce(response([]))
    .mockImplementationOnce(
      () =>
        new Promise(resolvePromise => {
          resolve = resolvePromise;
        })
    )
    .mockResolvedValueOnce(response([contact("two")], 2));
  vi.stubGlobal("fetch", fetcher);
  render(<ContactsView accessToken="token" />);
  await screen.findByText("Person one");
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Person" },
  });
  await act(async () => resolve(response([contact("late")], 2)));
  expect(screen.queryByText("Person late")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais contatos" })
  );
  await screen.findByText("Person two");
  expect(fetcher.mock.calls[3]?.[0]).toContain("page=2");
});
