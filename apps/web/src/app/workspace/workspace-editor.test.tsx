import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkspacePreferences } from "@axes/contracts";
import { WorkspaceProvider } from "./workspace-provider";
import { WorkspaceEditor } from "./workspace-editor";
const session: any = {
  accessToken: "token",
  user: { id: "u" },
  organization: { id: "o" },
  permissions: ["company.read"],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Workspace editor", () => {
  it("edits without saving until the explicit action", async () => {
    const fetchMock = vi.fn(
      async (_input: unknown, init?: any) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            init?.body
              ? JSON.parse(init.body)
              : createDefaultWorkspacePreferences(),
        }) as Response
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WorkspaceProvider session={session}>
        <WorkspaceEditor session={session} />
      </WorkspaceProvider>
    );
    const select = await screen.findByLabelText("Seção de abertura");
    await waitFor(() => expect(select).not.toBeDisabled());
    fireEvent.change(select, { target: { value: "companies" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar preferências" })
    );
    expect(
      await screen.findByText(
        "Preferências salvas para este usuário e organização."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Favorito Usuários e perfis")
    ).not.toBeInTheDocument();
  });
});
