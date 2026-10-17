"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../i18n/language-provider";

type Drag = {
  kind: "pointer" | "mouse" | "touch";
  id: number;
  x: number;
  y: number;
};

export function FloatingTourPanel({
  children,
  label = "Tour das funcionalidades do CRM",
}: {
  children: ReactNode;
  label?: string;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const helpId = useId();
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  function moveTo(x: number, y: number) {
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    });
  }
  function nudge(x: number, y: number) {
    const bounds = panel.current?.getBoundingClientRect();
    if (bounds) moveTo(bounds.left + x, bounds.top + y);
  }
  function start(kind: Drag["kind"], id: number, x: number, y: number) {
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds || drag.current) return;
    drag.current = { kind, id, x: x - bounds.left, y: y - bounds.top };
    setDragging(true);
  }

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    function stop() {
      drag.current = null;
      setDragging(false);
    }
    function pointerMove(event: PointerEvent) {
      const current = drag.current;
      if (current?.kind === "pointer" && current.id === event.pointerId)
        moveTo(event.clientX - current.x, event.clientY - current.y);
    }
    function mouseMove(event: MouseEvent) {
      const current = drag.current;
      if (current?.kind === "mouse")
        moveTo(event.clientX - current.x, event.clientY - current.y);
    }
    function touchMove(event: TouchEvent) {
      const current = drag.current;
      if (current?.kind !== "touch") return;
      const touch = Array.from(event.touches).find(
        item => item.identifier === current.id
      );
      if (touch) {
        event.preventDefault();
        moveTo(touch.clientX - current.x, touch.clientY - current.y);
      }
    }
    function keepVisible() {
      const bounds = panel.current?.getBoundingClientRect();
      if (bounds) moveTo(bounds.left, bounds.top);
    }
    keepVisible();
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", stop);
    window.addEventListener("touchcancel", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("resize", keepVisible);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(keepVisible);
    if (panel.current) observer?.observe(panel.current);
    return () => {
      drag.current = null;
      observer?.disconnect();
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", stop);
      window.removeEventListener("touchcancel", stop);
      window.removeEventListener("blur", stop);
      window.removeEventListener("resize", keepVisible);
    };
  }, [mounted]);

  if (!mounted) return null;
  const controls = [
    { name: "Mover para a esquerda", icon: "←", x: -40, y: 0 },
    { name: "Mover para cima", icon: "↑", x: 0, y: -40 },
    { name: "Mover para baixo", icon: "↓", x: 0, y: 40 },
    { name: "Mover para a direita", icon: "→", x: 40, y: 0 },
  ];
  return createPortal(
    <>
      {dragging ? (
        <div
          className="floating-tour-drag-shield"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147482999,
            background: "transparent",
            cursor: "grabbing",
            touchAction: "none",
          }}
        />
      ) : null}
      <aside
        ref={panel}
        className="first-access-panel floating-tour-panel"
        role="dialog"
        aria-label={t(label)}
        aria-modal="false"
        style={{
          position: "fixed",
          zIndex: 2147483000,
          pointerEvents: "auto",
          ...(position
            ? {
                left: position.x,
                top: position.y,
                right: "auto",
                bottom: "auto",
              }
            : {}),
        }}
      >
        <div className="floating-tour-toolbar">
          <button
            type="button"
            className="floating-tour-handle"
            aria-label={t("Mover painel do tour")}
            aria-describedby={helpId}
            onPointerDown={event => {
              if (event.isPrimary === false || event.button > 0) return;
              event.preventDefault();
              start("pointer", event.pointerId, event.clientX, event.clientY);
            }}
            onMouseDown={event => {
              if (event.button === 0) {
                event.preventDefault();
                start("mouse", 0, event.clientX, event.clientY);
              }
            }}
            onTouchStart={event => {
              const touch = event.touches[0];
              if (touch)
                start("touch", touch.identifier, touch.clientX, touch.clientY);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
            onKeyDown={event => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-20, 0],
                ArrowRight: [20, 0],
                ArrowUp: [0, -20],
                ArrowDown: [0, 20],
              };
              const direction = directions[event.key];
              if (direction) {
                event.preventDefault();
                nudge(...direction);
              }
            }}
          >
            <span aria-hidden="true">⠿</span> {t("Mover painel")}
          </button>
          {controls.map(control => (
            <button
              type="button"
              key={control.name}
              className="floating-tour-control"
              aria-label={t(control.name)}
              title={t(control.name)}
              onClick={() => nudge(control.x, control.y)}
            >
              {control.icon}
            </button>
          ))}
          <button
            type="button"
            className="floating-tour-control"
            aria-label={t("Centralizar painel")}
            title={t("Centralizar painel")}
            onClick={() => {
              const bounds = panel.current?.getBoundingClientRect();
              if (bounds)
                moveTo(
                  (window.innerWidth - bounds.width) / 2,
                  (window.innerHeight - bounds.height) / 2
                );
            }}
          >
            ⊙
          </button>
        </div>
        <small id={helpId} className="floating-tour-help">
          {t("Arraste pelo cabeçalho ou use as setas para mover este painel.")}
        </small>
        {children}
      </aside>
    </>,
    document.body
  );
}
