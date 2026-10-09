"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  parseFrameMessage,
  resolveFrameDimensions,
  type EmbeddedApplication,
  type FrameSize,
} from "./embedded-application";

export function EmbeddedFrame({
  application,
  timeoutMs = 20000,
}: {
  application: EmbeddedApplication;
  timeoutMs?: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<
    "loading" | "loaded" | "timeout" | "error"
  >("loading");
  const [size, setSize] = useState<FrameSize>({ isExpanded: false });
  const [containerWidth, setContainerWidth] = useState(application.maxWidth);
  const [protocolConfirmed, setProtocolConfirmed] = useState(false);
  const dimensions = resolveFrameDimensions(size, containerWidth, application);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("timeout"), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [status, timeoutMs, reloadKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      if (container.clientWidth > 0) setContainerWidth(container.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(container);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const source = iframeRef.current?.contentWindow;
      if (
        !source ||
        event.origin !== application.origin ||
        event.source !== source
      )
        return;
      const parsed = parseFrameMessage(event.data);
      if (parsed.success) {
        setProtocolConfirmed(true);
        setSize(parsed.data);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [application.origin]);

  function retry() {
    setStatus("loading");
    setProtocolConfirmed(false);
    setSize({ isExpanded: false });
    setReloadKey(value => value + 1);
  }

  return (
    <div className="communication-frame" ref={containerRef}>
      <div className="communication-frame__toolbar">
        <p role="status" aria-live="polite">
          {status === "loading" && `Carregando ${application.name}...`}
          {status === "loaded" &&
            (protocolConfirmed
              ? "Documento carregado e comunicação de dimensionamento recebida do NEO. Isso não confirma autenticação ou atendimento ativo."
              : "Documento do iframe carregado; autenticação e funcionamento do NEO ainda não foram confirmados.")}
          {status === "timeout" &&
            "O documento do iframe não informou conclusão de carregamento no prazo. Tente novamente ou abra em outra aba."}
          {status === "error" &&
            "Não foi possível carregar o NEO Interact. Tente novamente ou abra em outra aba."}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={retry}
          aria-label={
            status === "timeout" || status === "error"
              ? "Tentar novamente"
              : "Recarregar comunicação"
          }
        >
          <RefreshCw aria-hidden="true" />
          {status === "timeout" || status === "error"
            ? "Tentar novamente"
            : "Recarregar"}
        </Button>
      </div>
      <div className="communication-frame__viewport">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          id={`embedded-app-${application.id}`}
          title={application.name}
          src={application.src}
          allow={`camera ${application.origin}; microphone ${application.origin}; clipboard-write ${application.origin}`}
          allowFullScreen
          referrerPolicy="no-referrer"
          style={{
            width: dimensions.width,
            height: `${dimensions.height}px`,
            maxWidth: `min(100%, ${application.maxWidth}px)`,
          }}
          onLoad={() => {
            setStatus("loaded");
            setProtocolConfirmed(false);
            iframeRef.current?.contentWindow?.postMessage(
              { type: "init", timestamp: Date.now() },
              application.origin
            );
          }}
          onError={() => setStatus("error")}
        />
      </div>
    </div>
  );
}
