"use client";

import { ExternalLink, Headset } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api-client";
import {
  readCommunicationApplication,
  type CommunicationConfiguration,
} from "./embedded-application";
import type { NeoSettings } from "../admin/neo-communication-settings-view";
import { EmbeddedFrame } from "./embedded-frame";
import { useCommunicationConfiguration } from "./communication-provider";

export function CommunicationView({ accessToken }: { accessToken?: string }) {
  const environmentConfiguration = useCommunicationConfiguration();
  const [tenantConfiguration, setTenantConfiguration] =
    useState<CommunicationConfiguration | null>(null);
  const [loading, setLoading] = useState(Boolean(accessToken));
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    void apiRequest<NeoSettings>("/integrations/neo-communication", {
      accessToken,
    })
      .then(settings => {
        if (!active) return;
        setTenantConfiguration(
          settings.enabled
            ? readCommunicationApplication({
                NEO_INTERACT_URL: settings.url,
                NEO_INTERACT_MODE: settings.mode,
                NEO_INTERACT_FRAME_HEIGHT: String(settings.height),
                NEO_INTERACT_FRAME_MAX_WIDTH: String(settings.maxWidth),
                WEB_ORIGIN: window.location.origin,
              })
            : { status: "disabled" }
        );
      })
      .catch(() => {
        if (active) setTenantConfiguration({ status: "invalid" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken]);
  const configuration = accessToken
    ? (tenantConfiguration ?? { status: "disabled" as const })
    : environmentConfiguration;
  return (
    <section
      className="communication-view"
      aria-labelledby="communication-title"
    >
      <header className="activities-view__header">
        <div>
          <p className="activities-view__eyebrow">Atendimento omnichannel</p>
          <h1 id="communication-title">
            <Headset aria-hidden="true" />
            Comunicação integrada
          </h1>
          <p>Acesse o NEO Interact para realizar seu atendimento.</p>
        </div>
        {configuration.status === "ready" ? (
          <a
            className="communication-view__external"
            href={configuration.application.src}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink aria-hidden="true" />
            Abrir em outra aba
          </a>
        ) : null}
      </header>
      {loading ? (
        <p role="status">Consultando configuração de comunicação...</p>
      ) : configuration.status === "ready" ? (
        <>
          {configuration.mode === "tab" ? (
            <div className="companies-view__empty" role="status">
              <strong>Comunicação configurada para abrir em outra aba</strong>
              <span>
                Use “Abrir em outra aba” e entre com suas credenciais do NEO
                Interact. A aba de atendimento permanece aberta enquanto você
                navega pelo CRM.
              </span>
            </div>
          ) : (
            <>
              <p className="communication-view__notice">
                Entre com suas credenciais do NEO Interact. Se o navegador ou o
                serviço impedir a abertura integrada, use “Abrir em outra aba”.
              </p>
              <EmbeddedFrame
                key={configuration.application.src}
                application={configuration.application}
              />
            </>
          )}
        </>
      ) : (
        <div className="companies-view__empty" role="status">
          <strong>
            {configuration.status === "disabled"
              ? "Comunicação ainda não configurada"
              : "Configuração de comunicação indisponível"}
          </strong>
          <span>
            Solicite ao administrador a configuração do endereço do NEO Interact
            para este ambiente.
          </span>
        </div>
      )}
    </section>
  );
}
