import type { Metadata } from "next";

import { PublicSatisfactionForm } from "../public-satisfaction-form";

export const metadata: Metadata = {
  title: "Avaliação do atendimento",
  robots: { index: false, follow: false },
  // O token está na URL: não o repasse a terceiros no Referer.
  referrer: "no-referrer",
};

/** C5.4 — página pública (sem login) de avaliação do atendimento. */
export default async function SatisfactionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicSatisfactionForm token={token} />;
}
