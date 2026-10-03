import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmbeddedFrame } from "./embedded-frame";
import { readCommunicationApplication } from "./embedded-application";

const config = readCommunicationApplication({
  NEO_INTERACT_URL: "https://neo.example.test/neo/",
});
if (config.status !== "ready") throw new Error("Invalid fixture");
const application = config.application;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Communication iframe", () => {
  it("loads only the configured URL and sends the technical init message to its origin", () => {
    render(<EmbeddedFrame application={application} />);
    const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;
    const send = vi.spyOn(iframe.contentWindow!, "postMessage");
    expect(iframe).toHaveAttribute("src", application.src);
    expect(iframe.getAttribute("allow")).toContain(
      `microphone ${application.origin}`
    );
    fireEvent.load(iframe);
    expect(send).toHaveBeenCalledWith(
      { type: "init", timestamp: expect.any(Number) },
      application.origin
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Conteúdo incorporado carregado"
    );
  });
  it("rejects foreign origins, other windows and invalid payloads; accepts a resize from the real frame", () => {
    render(<EmbeddedFrame application={application} />);
    const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;
    const data = {
      type: "TOGGLE_IFRAME_SIZE",
      isExpanded: true,
      width: 600,
      height: 900,
    };
    for (const event of [
      {
        origin: "https://evil.example.test",
        source: iframe.contentWindow,
        data,
      },
      { origin: application.origin, source: window, data },
      {
        origin: application.origin,
        source: iframe.contentWindow,
        data: { ...data, height: -1 },
      },
    ]) {
      act(() => window.dispatchEvent(new MessageEvent("message", event)));
      expect(iframe.style.width).toBe("100%");
    }
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: application.origin,
          source: iframe.contentWindow,
          data,
        })
      )
    );
    expect(iframe.style.width).toBe("600px");
    expect(iframe.style.height).toBe("900px");
  });
  it("offers an explicit retry on timeout and resets the frame dimensions", () => {
    vi.useFakeTimers();
    render(<EmbeddedFrame application={application} timeoutMs={50} />);
    const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;
    act(() => vi.advanceTimersByTime(51));
    expect(screen.getByRole("status")).toHaveTextContent("não confirmou");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByTitle("NEO Interact")).not.toBe(iframe);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando");
  });
});

it("clamps an expanded iframe when its container shrinks without reconnecting", () => {
  render(<EmbeddedFrame application={application} />);
  const iframe = screen.getByTitle("NEO Interact") as HTMLIFrameElement;
  const container = iframe.closest(".communication-frame")!;
  let width = 900;
  Object.defineProperty(container, "clientWidth", { get: () => width });
  act(() => window.dispatchEvent(new Event("resize")));
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: application.origin,
        source: iframe.contentWindow,
        data: {
          type: "TOGGLE_IFRAME_SIZE",
          isExpanded: true,
          width: 1500,
          height: 900,
        },
      })
    )
  );
  expect(iframe.style.width).toBe("900px");
  width = 390;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(iframe.style.width).toBe("390px");
  expect(screen.getByTitle("NEO Interact")).toBe(iframe);
});
