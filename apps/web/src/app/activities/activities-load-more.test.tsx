import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActivitiesView } from "./activities-view";

const props = { accessToken: "token", ownerUserId: "owner", canWrite: false };
const activity = (id: string) => ({
  id,
  title: id,
  type: "TASK",
  status: "PENDING",
  priority: "HIGH",
  description: null,
  companyId: null,
  contactId: null,
  ownerUserId: "owner",
  dueAt: null,
  completedAt: null,
  cancelledAt: null,
});
const response = (items: ReturnType<typeof activity>[], page = 1, total = 40) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ items, page, limit: 20, total }),
  }) as Response;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("appends authenticated pages, deduplicates IDs and stops at the last page", async () => {
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    response([activity("first")])
  );
  fetchMock
    .mockResolvedValueOnce(response([activity("first")]))
    .mockResolvedValueOnce(
      response([activity("first"), activity("second")], 2)
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<ActivitiesView {...props} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais atividades" })
  );
  expect(await screen.findByText("second")).toBeInTheDocument();
  expect(screen.getAllByText("first")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Carregar mais atividades" })
  ).not.toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[1]!;
  expect(String(url)).toContain(
    "page=2&limit=20&status=PENDING&sortBy=dueAt&sortOrder=asc"
  );
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token");
});

it("retains the list on extra-page failure and retries the same page", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response([activity("first")]))
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: "Page failed" }),
    })
    .mockResolvedValueOnce(response([activity("second")], 2));
  vi.stubGlobal("fetch", fetchMock);
  render(<ActivitiesView {...props} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais atividades" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Page failed");
  expect(screen.getByText("first")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais atividades" })
  );
  expect(await screen.findByText("second")).toBeInTheDocument();
  expect(String(fetchMock.mock.calls[2]?.[0])).toContain("page=2");
});

it.each(["status", "query", "token"])(
  "ignores late pages after a %s change and prevents concurrent loads",
  async change => {
    let resolvePage!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([activity("first")]))
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            resolvePage = resolve;
          })
      )
      .mockResolvedValue(response([activity("fresh")], 1, 1));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ActivitiesView {...props} />);
    const button = await screen.findByRole("button", {
      name: "Carregar mais atividades",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (change === "status")
      fireEvent.click(screen.getByRole("button", { name: "Concluídas" }));
    if (change === "query") {
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "fresh" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    }
    if (change === "token")
      view.rerender(<ActivitiesView {...props} accessToken="new-token" />);
    await screen.findByText("fresh");
    await act(async () => resolvePage(response([activity("stale")], 2)));
    await waitFor(() =>
      expect(screen.queryByText("stale")).not.toBeInTheDocument()
    );
    expect(screen.queryByText("first")).not.toBeInTheDocument();
  }
);

it("resets pagination after a mutation and discards its pending extra page", async () => {
  let resolvePage!: (response: Response) => void;
  let reads = 0;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") return response([]);
    if (String(url).includes("page=2"))
      return new Promise<Response>(resolve => {
        resolvePage = resolve;
      });
    reads += 1;
    return reads === 1
      ? response([activity("first")])
      : response([activity("fresh")], 1, 21);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ActivitiesView {...props} canWrite />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais atividades" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
  await screen.findByText("fresh");
  await act(async () => resolvePage(response([activity("stale")], 2)));
  expect(screen.queryByText("stale")).not.toBeInTheDocument();
  expect(screen.queryByText("first")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Carregar mais atividades" })
  ).toBeEnabled();
});

it("keeps submitted search and local filters while loading more", async () => {
  const fetchMock = vi.fn(async (url: string | URL) =>
    response(
      [activity(String(url).includes("page=2") ? "second" : "first")],
      String(url).includes("page=2") ? 2 : 1
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<ActivitiesView {...props} />);
  await screen.findByText("first");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "proposal" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await screen.findByText("first");
  fireEvent.change(screen.getByLabelText("Filtrar prioridade"), {
    target: { value: "LOW" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais atividades" })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Carregar mais atividades" })
    ).not.toBeInTheDocument()
  );
  expect(screen.queryByText("second")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filtrar prioridade"), {
    target: { value: "all" },
  });
  expect(screen.getByText("second")).toBeInTheDocument();
  expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("q=proposal");
});
