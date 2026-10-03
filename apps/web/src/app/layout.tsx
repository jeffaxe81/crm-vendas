import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { CommunicationProvider } from "./communication/communication-provider";
import { readCommunicationApplication } from "./communication/embedded-application";

import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Axesistemas",
  description: "Fundação técnica do CRM Axesistemas",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();
  const configuration = readCommunicationApplication(process.env);
  return (
    <html lang="pt-BR">
      <body>
        <CommunicationProvider configuration={configuration}>
          {children}
        </CommunicationProvider>
      </body>
    </html>
  );
}
