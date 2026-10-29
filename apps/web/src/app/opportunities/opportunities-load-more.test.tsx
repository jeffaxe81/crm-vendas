import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OpportunitiesView } from "./opportunities-view";

const record = (id: number) => ({
  id: String(id),
  title: `Negociação ${id}`,
  pipelineId: "pipeline",
  stageId: "stage",
  companyId: null,
  contactId: null,
  ownerUserId: "owner",
  estimatedValue: "100",
  expectedCloseAt: null,
  notes: null,
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
});
const page = (
  items = Array.from({ length: 20 }, (_, i) => record(i + 1)),
  current = 1,
  total = 21
) => ({ items, page: current, limit: 20, total });
const response = (body: unknown, status = 200) =>
  ({ ok: status === 200, status, json: async () => body }) as Response;
const props = { accessToken: "token", ownerUserId: "owner", canWrite: false };
function setup(extra: (url: URL) => Promise<Response>) {
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/pipelines"))
      return response([
        {
          id: "pipeline",
          name: "Vendas",
          stages: [{ id: "stage", name: "Aberta", position: 1 }],
        },
      ]);
    if (url.searchParams.get("page") === "1") return response(page());
    return extra(url);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("appends authenticated pages once, deduplicates IDs and shares records with Kanban", async () => {
  let resolve!: (result: Response) => void;
  const fetcher = setup(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  render(<OpportunitiesView {...props} />);
  const more = await screen.findByRole("button", {
    name: "Carregar mais oportunidades",
  });
  fireEvent.click(more);
  expect(more).toBeDisabled();
  fireEvent.click(more);
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).includes("page=2"))
  ).toHaveLength(1);
  await act(async () => resolve(response(page([record(20), record(21)], 2))));
  expect(await screen.findByText("Negociação 21")).toBeVisible();
  expect(screen.getAllByText("Negociação 20")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Carregar mais oportunidades" })
  ).not.toBeInTheDocument();
  const call = (fetcher.mock.calls as unknown as [string, RequestInit][]).find(
    ([url]) => url.includes("page=2")
  );
  expect(call?.[0]).toContain("limit=20");
  expect(call?.[1].headers).toMatchObject({ Authorization: "Bearer token" });
  fireEvent.click(screen.getByRole("button", { name: "Funil" }));
  expect(await screen.findByText("Negociação 21")).toBeVisible();
});
it("keeps loaded opportunities on extra-page failure and retries that page", async () => {
  let attempts = 0;
  setup(async url => {
    expect(url.searchParams.get("page")).toBe("2");
    return ++attempts === 1
      ? response({ message: "Falha temporária" }, 500)
      : response(page([record(21)], 2));
  });
  render(<OpportunitiesView {...props} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais oportunidades" })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha temporária"
  );
  expect(screen.getByText("Negociação 1")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Carregar mais oportunidades" })
  );
  expect(await screen.findByText("Negociação 21")).toBeVisible();
});
it.each(["token", "query"])(
  "ignores a late page after %s changes and resets pagination",
  async change => {
    let resolve!: (result: Response) => void;
    const fetcher = setup(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const view = render(<OpportunitiesView {...props} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Carregar mais oportunidades" })
    );
    if (change === "token")
      view.rerender(<OpportunitiesView {...props} accessToken="new-token" />);
    else {
      fireEvent.change(screen.getByLabelText("Buscar oportunidades"), {
        target: { value: "novo" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    }
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([url]) => String(url).includes("page=1"))
      ).toHaveLength(2)
    );
    await act(async () => resolve(response(page([record(99)], 2))));
    expect(screen.queryByText("Negociação 99")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Carregar mais oportunidades" })
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Carregar mais oportunidades" })
    );
    const lastUrl = String(fetcher.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain("page=2");
    if (change === "query") expect(lastUrl).toContain("q=novo");
  }
);

it("resets pages after moving an opportunity and ignores the old pending page", async () => {
  let resolve!: (result: Response) => void;
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/pipelines"))
        return response([
          {
            id: "pipeline",
            name: "Vendas",
            stages: [
              { id: "stage", name: "Aberta", position: 1 },
              { id: "next", name: "Proposta", position: 2 },
            ],
          },
        ]);
      if (url.pathname.endsWith("/stage")) return response(record(1));
      if (url.searchParams.get("page") === "1") {
        reads++;
        return response(
          page(reads === 1 ? undefined : [record(1)], 1, reads === 1 ? 60 : 1)
        );
      }
      return new Promise<Response>(done => {
        resolve = done;
      });
    })
  );
  render(<OpportunitiesView {...props} canMove />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais oportunidades" })
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Etapa de Negociação 1" }),
    { target: { value: "next" } }
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Mover etapa" })[0]!);
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => resolve(response(page([record(99)], 2, 60))));
  expect(screen.queryByText("Negociação 99")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Carregar mais oportunidades" })
  ).not.toBeInTheDocument();
  expect(screen.getByText("Negociação 1")).toBeVisible();
});
