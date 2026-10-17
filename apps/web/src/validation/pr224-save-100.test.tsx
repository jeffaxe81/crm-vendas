import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../components/save-feedback";

function Form({
  label,
  action,
  close,
}: {
  label: string;
  action: (draft: string) => Promise<void>;
  close: boolean;
}) {
  const save = useSaveFeedback();
  const [value, setValue] = useState("rascunho preservado");
  const [open, setOpen] = useState(true);
  return (
    <>
      <SaveNotice status={save.status} label={`${label}: confirmado`} />
      {open ? (
        <form
          onSubmit={async event => {
            event.preventDefault();
            if (!save.start()) return;
            try {
              await action(value);
              save.saved();
              if (close) setOpen(false);
            } catch {
              save.failed();
            }
          }}
        >
          <input
            aria-label="Rascunho"
            value={value}
            onChange={event => setValue(event.target.value)}
          />
          <SaveButton type="submit" label={label} status={save.status} />
        </form>
      ) : null}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const labels = [
  "Salvar empresa",
  "Salvar alterações",
  "Salvar produto",
  "Salvar contato",
  "Salvar canal",
  "Salvar histórico",
  "Salvar campos customizados",
  "Salvar perfil",
  "Salvar identidade visual",
  "Salvar preferências",
  "Salvar configuração",
  "Salvar preferência",
  "Salvar agendamento",
  "Salvar e continuar",
  "Concluir etapa Organização",
  "Concluir etapa Equipe",
  "Concluir etapa Estrutura",
  "Concluir etapa Dados",
  "Concluir etapa Ajuda",
  "Concluir etapa Revisão",
];
const scenarios = ["pending", "success", "failure", "close", "retry"];
describe("PR224: 100 save-feedback combinations", () => {
  it.each(
    labels.flatMap(label => scenarios.map(scenario => ({ label, scenario })))
  )("$label — $scenario", async ({ label, scenario }) => {
    vi.useFakeTimers();
    let resolve!: () => void, reject!: (error: Error) => void;
    const action = vi.fn(
      () =>
        new Promise<void>((ok, fail) => {
          resolve = ok;
          reject = fail;
        })
    );
    render(<Form label={label} action={action} close={scenario === "close"} />);
    const button = screen.getByRole("button", { name: label });
    fireEvent.change(screen.getByLabelText("Rascunho"), {
      target: { value: "valor editado" },
    });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.textContent).toContain("Salvando");
    expect(action).toHaveBeenCalledWith("valor editado");
    if (scenario === "pending") {
      fireEvent.click(button);
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(action).toHaveBeenCalledOnce();
      expect(button).toBeDisabled();
      expect(screen.getByRole("status").textContent).not.toContain(
        "confirmado"
      );
      return;
    }
    if (scenario === "failure" || scenario === "retry") {
      await act(async () => {
        reject(new Error("Falha da API"));
      });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("data-save-status", "error");
      expect(screen.getByLabelText("Rascunho")).toHaveValue("valor editado");
      expect(screen.getByRole("status")).toHaveTextContent(
        "Não foi possível salvar"
      );
      if (scenario === "failure") return;
      fireEvent.click(button);
      expect(action).toHaveBeenCalledTimes(2);
    }
    await act(async () => resolve());
    expect(screen.getByRole("status")).toHaveTextContent(
      `${label}: confirmado`
    );
    if (scenario === "close")
      expect(
        screen.queryByRole("button", { name: label })
      ).not.toBeInTheDocument();
    else {
      expect(button).toHaveAttribute("data-save-status", "success");
      expect(button).toHaveTextContent("✓ Salvo!");
      expect(button).toBeEnabled();
    }
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByRole("status")).toHaveTextContent("confirmado");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
