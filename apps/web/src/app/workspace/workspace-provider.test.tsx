import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkspacePreferences } from "@axes/contracts";
import { WorkspaceProvider, useWorkspace } from "./workspace-provider";
const session: any = {
  accessToken: "token",
  user: { id: "user-a" },
  organization: { id: "org-a" },
  permissions: ["company.read"],
};
function Probe() {
  const w = useWorkspace()!;
  return (
    <>
      <p>{w.saved.defaultSection}</p>
      <p>{w.draft.favorites.join(",")}</p>
      <button
        onClick={() => w.setDraft({ ...w.draft, favorites: ["companies"] })}
      >
        Editar
      </button>
      <button onClick={() => void w.save()}>Salvar</button>
      <p role="status">{w.error || w.message}</p>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("WorkspaceProvider", () => {
  it.each(["GET", "PUT"])(
    "ignores delayed %s from the previous identity",
    async method => {
      let resolve!: (value: Response) => void;
      const response = (value: unknown) =>
        ({ ok: true, status: 200, json: async () => value }) as Response;
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          calls++;
          if (
            (method === "GET" && calls === 1) ||
            (method === "PUT" && calls === 2)
          )
            return new Promise<Response>(done => {
              resolve = done;
            });
          return response(createDefaultWorkspacePreferences());
        })
      );
      const view = render(
        <WorkspaceProvider session={session}>
          <Probe />
        </WorkspaceProvider>
      );
      if (method === "PUT") {
        await act(async () => {});
        fireEvent.click(screen.getByText("Editar"));
        fireEvent.click(screen.getByText("Salvar"));
      }
      view.rerender(
        <WorkspaceProvider
          session={{
            ...session,
            accessToken: "new-token",
            user: { id: "user-b" },
          }}
        >
          <Probe />
        </WorkspaceProvider>
      );
      await act(async () => {});
      await act(async () =>
        resolve(
          response({
            ...createDefaultWorkspacePreferences(),
            defaultSection: "companies",
            favorites: ["companies"],
          })
        )
      );
      expect(screen.getByText("home")).toBeInTheDocument();
      expect(screen.queryByText("companies")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("");
    }
  );
  it("does not apply a response after logout/unmount", async () => {
    let resolve!: (value: Response) => void;
    const applied = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(done => {
            resolve = done;
          })
      )
    );
    const view = render(
      <WorkspaceProvider session={session} onInitialPreferences={applied}>
        <Probe />
      </WorkspaceProvider>
    );
    view.unmount();
    await act(async () =>
      resolve({
        ok: true,
        status: 200,
        json: async () => createDefaultWorkspacePreferences(),
      } as Response)
    );
    expect(applied).not.toHaveBeenCalled();
  });
  it("reads preferences and writes only on explicit save", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => createDefaultWorkspacePreferences(),
        }) as Response
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceProvider session={session}>
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Editar"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls as any)[1][1].method).toBe("PUT");
  });
  it("keeps a draft after a failed save", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => createDefaultWorkspacePreferences(),
        }) as Response
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceProvider session={session}>
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("Falha no salvamento");
    });
    fireEvent.click(screen.getByText("Editar"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha no salvamento")).toBeInTheDocument();
    expect(screen.getByText("companies")).toBeInTheDocument();
  });
});
