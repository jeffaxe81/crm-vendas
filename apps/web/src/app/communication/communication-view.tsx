"use client";

import { ExternalLink, Headset } from "lucide-react";
import { EmbeddedFrame } from "./embedded-frame";
import { useCommunicationConfiguration } from "./communication-provider";

export function CommunicationView() {
  const configuration = useCommunicationConfiguration();
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
      {configuration.status === "ready" ? (
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
