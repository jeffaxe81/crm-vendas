import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveButton, SaveNotice, useSaveFeedback } from "./save-feedback";

function Editor({ save }: { save: () => Promise<void> }) {
  const feedback = useSaveFeedback();
  return (
    <>
      <SaveButton
        label="Salvar"
        status={feedback.status}
        type="button"
        onClick={async () => {
          if (!feedback.start()) return;
          try {
            await save();
            feedback.saved();
          } catch {
            feedback.failed();
          }
        }}
      />
      <SaveNotice status={feedback.status} />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("save action feedback", () => {
  it("waits for confirmation, prevents duplicate clicks and shows success for three seconds", async () => {
    vi.useFakeTimers();
    let confirm!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>(resolve => {
          confirm = resolve;
        })
    );
    render(<Editor save={save} />);
    const button = screen.getByRole("button", { name: "Salvar" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.textContent).toContain("Salvando");
    expect(button.textContent).not.toContain("Salvo!");
    await act(async () => confirm());
    expect(button.textContent).toContain("Salvo!");
    expect(screen.getByRole("status").textContent).toContain(
      "Alterações salvas"
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(button.textContent).toBe("Salvar");
  });

  it("never confirms a rejected write and permits another attempt", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Servidor indisponível"));
    render(<Editor save={save} />);
    const button = screen.getByRole("button", { name: "Salvar" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.textContent).not.toContain("Salvo!");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain(
      "Não foi possível salvar"
    );
    await act(async () => {
      fireEvent.click(button);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
