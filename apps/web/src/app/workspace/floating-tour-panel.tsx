"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Position = { x: number; y: number };

export function FloatingTourPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  function moveTo(x: number, y: number) {
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return;
    const margin = 8;
    setPosition({
      x: Math.max(
        margin,
        Math.min(x, window.innerWidth - bounds.width - margin)
      ),
      y: Math.max(
        margin,
        Math.min(y, window.innerHeight - bounds.height - margin)
      ),
    });
  }

  useEffect(() => {
    function keepVisible() {
      const bounds = panel.current?.getBoundingClientRect();
      if (bounds) moveTo(bounds.left, bounds.top);
    }
    keepVisible();
    window.addEventListener("resize", keepVisible);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(keepVisible);
    if (panel.current) observer?.observe(panel.current);
    return () => {
      window.removeEventListener("resize", keepVisible);
      observer?.disconnect();
    };
  }, []);

  return (
    <aside
      ref={panel}
      className="first-access-panel floating-tour-panel"
      role="dialog"
      aria-label="Tour das funcionalidades do CRM"
      aria-modal="false"
      style={
        position
          ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
          : undefined
      }
    >
      <button
        type="button"
        className="floating-tour-handle"
        aria-label="Mover painel do tour"
        aria-describedby="tour-move-help"
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          const bounds = panel.current?.getBoundingClientRect();
          if (!bounds) return;
          drag.current = {
            id: event.pointerId,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const current = drag.current;
          if (current?.id === event.pointerId)
            moveTo(event.clientX - current.x, event.clientY - current.y);
        }}
        onPointerUp={event => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={event => {
          const directions: Record<string, Position> = {
            ArrowLeft: { x: -20, y: 0 },
            ArrowRight: { x: 20, y: 0 },
            ArrowUp: { x: 0, y: -20 },
            ArrowDown: { x: 0, y: 20 },
          };
          const direction = directions[event.key];
          const bounds = panel.current?.getBoundingClientRect();
          if (direction && bounds) {
            event.preventDefault();
            moveTo(bounds.left + direction.x, bounds.top + direction.y);
          }
        }}
      >
        <span aria-hidden="true">⠿</span> Mover tour
      </button>
      <small id="tour-move-help" className="floating-tour-help">
        Arraste pelo cabeçalho ou use as setas com o botão Mover tour em foco.
      </small>
      {children}
    </aside>
  );
}
