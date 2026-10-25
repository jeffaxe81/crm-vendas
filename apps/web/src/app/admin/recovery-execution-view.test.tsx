import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OperationPreview } from "@axes/contracts";
import { RecoveryExecutionView } from "./recovery-execution-view";
const preview: OperationPreview = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  actorUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  kind: "RESTORE",
  targetBackupId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  targetChecksum: "a".repeat(64),
  currentFingerprint: "b".repeat(64),
  targetSchemaVersion: 1,
  targetByteCount: 10,
  currentCounts: { Opportunity: 3 },
  targetCounts: { Opportunity: 1 },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const capabilities = {
  enabled: true,
  configured: true,
  confirmationPhrases: {
    restore: "RESTAURAR DADOS",
    delete: "EXCLUIR DADOS OPERACIONAIS",
  },
  maxPreviewAgeSeconds: 300,
};
const json = (value: unknown) =>
  ({ ok: true, status: 200, json: async () => value }) as Response;
function setup(
  enabled = true,
  execute?: (init?: RequestInit) => Promise<Response>
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/capabilities"))
      return json({ ...capabilities, enabled });
    if (url.endsWith("/delete/preview"))
      return json({ ...preview, kind: "DELETE", targetBackupId: null });
    if (url.endsWith("/operations")) return json([]);
    return execute
      ? execute(init)
      : json({
          id: "receipt",
          kind: "RESTORE",
          state: "COMPLETED",
          preventiveBackupId: "preventive",
          targetBackupId: preview.targetBackupId,
          completedAt: new Date().toISOString(),
        });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function fill(phrase = "RESTAURAR DADOS") {
  fireEvent.change(await screen.findByLabelText("Senha atual"), {
    target: { value: "secret" },
  });
  fireEvent.change(screen.getByLabelText(/Digite a frase exata:/), {
    target: { value: phrase },
  });
}
it("defaults off without exposing executable actions or mutations", async () => {
  const fetch = setup(false);
  render(<RecoveryExecutionView accessToken="token" preview={preview} />);
  await screen.findByText(/pendentes de homologação/);
  expect(screen.queryByRole("button", { name: /Executar/ })).toBeNull();
  expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
    false
  );
});
it("requires current password and exact phrase, posts once, retains receipt without refetch", async () => {
  const fetch = setup();
  render(<RecoveryExecutionView accessToken="token" preview={preview} />);
  const submit = await screen.findByRole("button", {
    name: "Executar restauração",
  });
  expect(submit).toBeDisabled();
  await fill("restaurar dados");
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Digite a frase exata:/), {
    target: { value: "RESTAURAR DADOS" },
  });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByText(/As sessões foram encerradas/);
  expect(screen.getByText(/Comprovante da operação:/)).toHaveTextContent(
    "receipt"
  );
  const posts = fetch.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0]![1]!.body as string)).toEqual({
    previewId: preview.id,
    password: "secret",
    confirmation: "RESTAURAR DADOS",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText("Senha atual")).toBeNull();
});
it.each([
  { ...preview, expiresAt: new Date(Date.now() - 1000).toISOString() },
  { ...preview, kind: "DELETE" as const },
  { ...preview, unsupportedRestoreModels: ["Opportunity"] },
])("blocks expired, wrong-kind and unsupported previews", async value => {
  setup();
  render(<RecoveryExecutionView accessToken="token" preview={value} />);
  await fill();
  expect(
    screen.getByRole("button", { name: "Executar restauração" })
  ).toBeDisabled();
});
it("manually prepares commercial deletion and requires separate confirmation", async () => {
  const fetch = setup();
  render(<RecoveryExecutionView accessToken="token" preview={null} />);
  expect(
    await screen.findByText(/remove também os dados comerciais/)
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Preparar prévia de exclusão operacional",
    })
  );
  await fill("EXCLUIR DADOS OPERACIONAIS");
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST")
  ).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Executar exclusão operacional" })
  );
  await screen.findByText(/Operação concluída/);
  expect(
    fetch.mock.calls.filter(([, init]) => init?.method === "POST")
  ).toHaveLength(2);
});
it("clears secrets after errors and preview changes", async () => {
  setup(true, async () => {
    throw Error("secret must never appear");
  });
  const { rerender } = render(
    <RecoveryExecutionView accessToken="token" preview={preview} />
  );
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Executar restauração" }));
  await screen.findByText(/A operação não foi confirmada/);
  expect(screen.getByLabelText("Senha atual")).toHaveValue("");
  expect(screen.getByLabelText(/Digite a frase exata:/)).toHaveValue("");
  await fill();
  rerender(
    <RecoveryExecutionView
      accessToken="token"
      preview={{ ...preview, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }}
    />
  );
  expect(screen.getByLabelText("Senha atual")).toHaveValue("");
});
it("ignores an old-token completion and clears credentials on session changes", async () => {
  let resolve!: (value: Response) => void;
  setup(
    true,
    () =>
      new Promise<Response>(done => {
        resolve = done;
      })
  );
  const { rerender } = render(
    <RecoveryExecutionView accessToken="old" preview={preview} />
  );
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Executar restauração" }));
  rerender(<RecoveryExecutionView accessToken="new" preview={preview} />);
  await waitFor(() =>
    expect(screen.getByLabelText("Senha atual")).toHaveValue("")
  );
  resolve(json({ id: "stale", state: "COMPLETED" }));
  await waitFor(() =>
    expect(screen.queryByText(/Comprovante da operação:/)).toBeNull()
  );
});
