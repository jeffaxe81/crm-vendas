import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingTourPanel } from "../app/workspace/floating-tour-panel";

let width = 200,
  height = 160;
let resizePanel: (() => void) | undefined;
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
beforeEach(() => {
  width = 200;
  height = 160;
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizePanel = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const x = this.style.left ? parseFloat(this.style.left) : 100;
      const y = this.style.top ? parseFloat(this.style.top) : 100;
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      };
    }
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <FloatingTourPanel>
      <button>Próximo</button>
      <input aria-label="Campo de fundo" defaultValue="preservado" />
    </FloatingTourPanel>
  );
  return {
    panel: screen.getByRole("dialog"),
    handle: screen.getByRole("button", { name: "Mover painel do tour" }),
  };
}
const viewports = [
  { w: 360, h: 640 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
];
const targets = [
  { x: -100, y: -100 },
  { x: 0, y: 0 },
  { x: 20, y: 20 },
  { x: 100, y: 250 },
  { x: 500, y: 400 },
  { x: 1500, y: 1000 },
  { x: -50, y: 1000 },
  { x: 3000, y: -50 },
];
describe("PR223: 40 drag boundary cases", () => {
  it.each(viewports.flatMap(v => targets.map(t => ({ ...v, ...t }))))(
    "$w x $h to $x,$y",
    ({ w, h, x, y }) => {
      vi.stubGlobal("innerWidth", w);
      vi.stubGlobal("innerHeight", h);
      const { panel, handle } = mount();
      const left = parseFloat(panel.style.left),
        top = parseFloat(panel.style.top);
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: left + 10,
        clientY: top + 10,
      });
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientX: x + 10,
        clientY: y + 10,
      });
      expect(parseFloat(panel.style.left)).toBe(
        Math.max(8, Math.min(x, w - 208))
      );
      expect(parseFloat(panel.style.top)).toBe(
        Math.max(8, Math.min(y, h - 168))
      );
      expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
    }
  );
});
const keys = [
  { key: "ArrowLeft", dx: -20, dy: 0 },
  { key: "ArrowRight", dx: 20, dy: 0 },
  { key: "ArrowUp", dx: 0, dy: -20 },
  { key: "ArrowDown", dx: 0, dy: 20 },
];
describe("PR223: 32 keyboard cases", () => {
  it.each(
    keys.flatMap(k =>
      [1, 2, 3, 5, 10, 20, 40, 100].map(count => ({ ...k, count }))
    )
  )("$key repeated $count", ({ key, dx, dy, count }) => {
    const { panel, handle } = mount();
    handle.focus();
    for (let n = 0; n < count; n++) fireEvent.keyDown(handle, { key });
    expect(parseFloat(panel.style.left)).toBe(
      Math.max(8, Math.min(100 + dx * count, 792))
    );
    expect(parseFloat(panel.style.top)).toBe(
      Math.max(8, Math.min(100 + dy * count, 632))
    );
    expect(handle).toHaveFocus();
  });
});
describe("PR223: 16 pointer source cases", () => {
  it.each(
    ["mouse", "touch", "pen", "secondary"].flatMap(type =>
      [150, 220, 340, 480].map(target => ({ type, target }))
    )
  )("$type target $target", ({ type, target }) => {
    const { panel, handle } = mount();
    fireEvent.pointerDown(handle, {
      pointerId: 9,
      pointerType: type,
      isPrimary: type !== "secondary",
      button: 0,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 9,
      clientX: target + 10,
      clientY: target + 10,
    });
    expect(parseFloat(panel.style.left)).toBe(
      type === "secondary" ? 100 : target
    );
    expect(parseFloat(panel.style.top)).toBe(
      type === "secondary" ? 100 : target
    );
  });
});
describe("PR223: 8 viewport and panel resizing cases", () => {
  it.each([320, 360, 480, 600, 768, 900, 1024, 1440])(
    "viewport shrinks to %i",
    size => {
      const { panel, handle } = mount();
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 110,
        clientY: 110,
      });
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientX: 790,
        clientY: 630,
      });
      vi.stubGlobal("innerWidth", size);
      vi.stubGlobal("innerHeight", size);
      fireEvent(window, new Event("resize"));
      expect(parseFloat(panel.style.left) + width).toBeLessThanOrEqual(
        size - 8
      );
      expect(parseFloat(panel.style.top) + height).toBeLessThanOrEqual(
        size - 8
      );
      height = 220;
      act(() => resizePanel?.());
      expect(parseFloat(panel.style.top) + height).toBeLessThanOrEqual(
        size - 8
      );
    }
  );
});
describe("PR223: 4 pointer lifecycle cases", () => {
  it.each(["pointerUp", "pointerCancel", "lostPointerCapture", "otherPointer"])(
    "stops or ignores %s",
    action => {
      const { panel, handle } = mount();
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 110,
        clientY: 110,
      });
      if (action === "pointerUp") fireEvent.pointerUp(handle, { pointerId: 1 });
      if (action === "pointerCancel")
        fireEvent.pointerCancel(handle, { pointerId: 1 });
      if (action === "lostPointerCapture")
        fireEvent.lostPointerCapture(handle, { pointerId: 1 });
      fireEvent.pointerMove(handle, {
        pointerId: action === "otherPointer" ? 2 : 1,
        clientX: 500,
        clientY: 500,
      });
      expect(panel.style.left).toBe("100px");
      expect(panel).toHaveAttribute("aria-modal", "false");
    }
  );
});
