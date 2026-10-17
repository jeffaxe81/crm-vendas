"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { apiRequest } from "../../lib/api-client";

type Allocation = {
  allocatedGiB: number | null;
  usedBytes: string;
  backupCount: number;
  usagePercent: number | null;
  alertLevel: "UNALLOCATED" | "OK" | "WARNING" | "EXCEEDED";
  enforced: false;
  scope: "ENCRYPTED_BACKUP_CATALOG";
  updatedAt: string | null;
};

function toGiB(bytes: string) {
  return (Number(bytes) / (1024 * 1024 * 1024)).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

export function TenantStorageAllocationView({
  accessToken,
}: {
  accessToken: string;
}) {
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [desired, setDesired] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let active = true;
    setAllocation(null);
    setDesired("");
    setConfirmation("");
    setBusy(false);
    setError("");
    setNotice("");
    void apiRequest<Allocation>("/admin/storage/allocation", { accessToken })
      .then(result => {
        if (!active || generationRef.current !== generation) return;
        setAllocation(result);
        setDesired(result.allocatedGiB?.toString() ?? "");
      })
      .catch(cause => {
        if (active && generationRef.current === generation) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o armazenamento da empresa."
          );
        }
      });
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current++;
    };
  }, [accessToken]);

  const numeric =
    desired === "" ||
    (/^\d+$/.test(desired) && Number.isSafeInteger(Number(desired)));
  const amount = desired === "" ? null : Number(desired);
  const valid =
    numeric && (amount === null || (amount >= 1 && amount <= 10240));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocation || busy || !valid || confirmation !== "AJUSTAR COTA")
      return;
    const generation = generationRef.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<Allocation>("/admin/storage/allocation", {
        accessToken,
        method: "PUT",
        body: { allocatedGiB: amount, confirmation },
      });
      if (generationRef.current !== generation) return;
      setAllocation(result);
      setDesired(result.allocatedGiB?.toString() ?? "");
      setConfirmation("");
      setNotice("Capacidade de referência da empresa atualizada.");
    } catch (cause) {
      if (generationRef.current !== generation) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a capacidade da empresa."
      );
    } finally {
      if (generationRef.current === generation) setBusy(false);
    }
  }

  return (
    <section
      className="companies-view__card"
      aria-label="Armazenamento de backups por empresa"
    >
      <h2>Capacidade de backups por empresa</h2>
      <p>
        Referência lógica de armazenamento por tenant. Não altera o tamanho
        físico do disco ou do banco de dados e não bloqueia novas gravações.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!allocation ? (
        <p>Carregando capacidade da empresa...</p>
      ) : (
        <>
          <p>
            Backups catalogados: <strong>{allocation.backupCount}</strong>.
            Volume identificado:{" "}
            <strong>{toGiB(allocation.usedBytes)} GiB</strong>.
          </p>
          <p>
            Capacidade de referência:{" "}
            <strong>
              {allocation.allocatedGiB === null
                ? "não definida"
                : `${allocation.allocatedGiB} GiB`}
            </strong>
            .
            {allocation.usagePercent === null
              ? ""
              : ` Utilização: ${allocation.usagePercent}%.`}
          </p>
          {allocation.alertLevel === "WARNING" ? (
            <p role="status">Atenção: utilização igual ou superior a 80%.</p>
          ) : null}
          {allocation.alertLevel === "EXCEEDED" ? (
            <p role="status">
              Capacidade de referência atingida ou ultrapassada. Verifique a
              capacidade física do servidor.
            </p>
          ) : null}
          <form onSubmit={event => void save(event)}>
            <label>
              Capacidade de referência (GiB, deixe vazio para não definir)
              <input
                type="number"
                min={1}
                max={10240}
                step={1}
                value={desired}
                disabled={busy}
                onChange={event => {
                  setDesired(event.target.value);
                  setConfirmation("");
                }}
              />
            </label>
            <label>
              Digite AJUSTAR COTA para confirmar
              <input
                autoComplete="off"
                value={confirmation}
                disabled={busy}
                onChange={event => setConfirmation(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !valid || confirmation !== "AJUSTAR COTA"}
            >
              Salvar capacidade da empresa
            </button>
          </form>
          <p>
            O consumo considera exclusivamente backups concluídos ou aguardando
            exclusão. Arquivos órfãos, dados do PostgreSQL e outros anexos não
            estão incluídos.
          </p>
        </>
      )}
    </section>
  );
}
