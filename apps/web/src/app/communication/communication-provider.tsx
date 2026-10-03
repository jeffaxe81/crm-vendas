"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CommunicationConfiguration } from "./embedded-application";

const CommunicationContext = createContext<CommunicationConfiguration>({
  status: "disabled",
});

export function CommunicationProvider({
  configuration,
  children,
}: {
  configuration: CommunicationConfiguration;
  children: ReactNode;
}) {
  return (
    <CommunicationContext.Provider value={configuration}>
      {children}
    </CommunicationContext.Provider>
  );
}

export function useCommunicationConfiguration() {
  return useContext(CommunicationContext);
}
