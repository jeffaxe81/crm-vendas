import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FloatingTourPanel } from "./floating-tour-panel";
class Pointer extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const x = parseFloat(this.style.left) || 100,
        y = parseFloat(this.style.top) || 100;
      return {
        x,
        y,
        left: x,
        top: y,
        width: 200,
        height: 160,
        right: x + 200,
        bottom: y + 160,
        toJSON: () => ({}),
      };
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <FloatingTourPanel>
      <p>Etapa</p>
    </FloatingTourPanel>
  );
  return {
    panel: screen.getByRole("dialog"),
    handle: screen.getByRole("button", { name: "Mover painel do tour" }),
  };
}
it("renders outside parent layout directly under document.body", () => {
  const { panel } = mount();
  expect(panel.parentElement).toBe(document.body);
});
it("moves with window pointer events without capture API", () => {
  const { panel, handle } = mount();
  fireEvent.pointerDown(handle, { button: 0, clientX: 110, clientY: 110 });
  fireEvent.pointerMove(window, { clientX: 410, clientY: 310 });
  expect(panel.style.left).toBe("400px");
  expect(panel.style.top).toBe("300px");
});
it("supports a mouse fallback without PointerEvent", () => {
  vi.stubGlobal("PointerEvent", undefined);
  const { panel, handle } = mount();
  fireEvent.mouseDown(handle, { button: 0, clientX: 110, clientY: 110 });
  fireEvent.mouseMove(window, { clientX: 310, clientY: 210 });
  expect(panel.style.left).toBe("300px");
  fireEvent.mouseUp(window);
  fireEvent.mouseMove(window, { clientX: 610, clientY: 610 });
  expect(panel.style.left).toBe("300px");
});
it("provides explicit movement controls when dragging is unavailable", () => {
  const { panel } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Mover para a direita" }));
  expect(panel.style.left).toBe("140px");
  fireEvent.click(screen.getByRole("button", { name: "Centralizar painel" }));
  expect(panel.style.left).toBe("400px");
  expect(panel.style.top).toBe("320px");
});
it("shields embedded iframes only during the drag and clears on release", () => {
  const { handle } = mount();
  expect(document.querySelector(".floating-tour-drag-shield")).toBeNull();
  fireEvent.pointerDown(handle, { button: 0, clientX: 110, clientY: 110 });
  expect(document.querySelector(".floating-tour-drag-shield")).not.toBeNull();
  fireEvent.pointerUp(window);
  expect(document.querySelector(".floating-tour-drag-shield")).toBeNull();
});
