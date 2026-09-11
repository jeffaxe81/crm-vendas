"use client";

import type {
  OpportunityCreateInput,
  OpportunityMoveInput,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type OpportunityRecord = {
  id: string;
  organizationId: string;
  pipelineId: string;
  stageId: string;
  companyId: string | null;
  contactId: string | null;
  ownerUserId: string;
  title: string;
  estimatedValue: string;
  expectedCloseAt: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type CompanyOption = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type ContactOption = {
  id: string;
  fullName: string;
};

type StageOption = {
  id: string;
  name: string;
  position: number;
};

type PipelineOption = {
  id: string;
  name: string;
  stages: StageOption[];
};

type ListResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

type OpportunityListResponse = ListResponse<OpportunityRecord>;

type OpportunitiesViewProps = {
  accessToken: string;
  ownerUserId: string;
  canWrite: boolean;
  canMove?: boolean;
};

type OpportunityFormState = {
  title: string;
  customer: string;
  pipelineId: string;
  stageId: string;
  estimatedValue: string;
  expectedCloseAt: string;
  notes: string;
};

const emptyForm: OpportunityFormState = {
  title: "",
  customer: "",
  pipelineId: "",
  stageId: "",
  estimatedValue: "",
  expectedCloseAt: "",
  notes: "",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

export function OpportunitiesView({
  accessToken,
  ownerUserId,
  canWrite,
  canMove = false,
}: OpportunitiesViewProps) {
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<OpportunityFormState>(emptyForm);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [movingOpportunityId, setMovingOpportunityId] = useState<string | null>(
    null
  );
  const [stageSelections, setStageSelections] = useState<
    Record<string, string>
  >({});
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectedPipeline = pipelines.find(
    pipeline => pipeline.id === form.pipelineId
  );

  useEffect(() => {
    let active = true;

    async function loadOpportunities() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: "1",
        limit: "20",
        sortBy: "updatedAt",
        sortOrder: "desc",
      });
      if (query) {
        params.set("q", query);
      }

      try {
        const result = await apiRequest<OpportunityListResponse>(
          `/opportunities?${params.toString()}`,
          { accessToken }
        );
        if (active) {
          setOpportunities(result.items);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as oportunidades."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOpportunities();

    return () => {
      active = false;
    };
  }, [accessToken, query, refreshVersion]);

  useEffect(() => {
    let active = true;

    if (!canMove) {
      return () => {
        active = false;
      };
    }

    async function loadPipelines() {
      try {
        const result = await apiRequest<PipelineOption[]>("/pipelines", {
          accessToken,
        });
        if (active) {
          setPipelines(result);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as etapas do funil."
          );
        }
      }
    }

    void loadPipelines();

    return () => {
      active = false;
    };
  }, [accessToken, canMove]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
  }

  async function openCreate() {
    if (!canWrite) {
      return;
    }

    setError("");
    setForm(emptyForm);
    setCreateOpen(true);

    try {
      const [pipelineResult, companyResult, contactResult] = await Promise.all([
        apiRequest<PipelineOption[]>("/pipelines", { accessToken }),
        apiRequest<ListResponse<CompanyOption>>("/companies?page=1&limit=100", {
          accessToken,
        }),
        apiRequest<ListResponse<ContactOption>>("/contacts?page=1&limit=100", {
          accessToken,
        }),
      ]);
      setPipelines(pipelineResult);
      setCompanies(companyResult.items);
      setContacts(contactResult.items);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os dados para a oportunidade."
      );
    }
  }

  async function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite || submitting) {
      return;
    }

    const title = form.title.trim();
    const estimatedValue = form.estimatedValue.trim();
    const [customerType, customerId] = form.customer.split(":", 2);

    if (
      !title ||
      !customerId ||
      !form.pipelineId ||
      !form.stageId ||
      !estimatedValue
    ) {
      setError("Preencha os campos obrigatórios da oportunidade.");
      return;
    }

    const payload: OpportunityCreateInput = {
      pipelineId: form.pipelineId,
      stageId: form.stageId,
      ownerUserId,
      title,
      estimatedValue,
      ...(customerType === "company"
        ? { companyId: customerId }
        : { contactId: customerId }),
      ...(form.expectedCloseAt
        ? { expectedCloseAt: new Date(form.expectedCloseAt).toISOString() }
        : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    setError("");
    setSubmitting(true);

    try {
      await apiRequest<OpportunityRecord>("/opportunities", {
        accessToken,
        method: "POST",
        body: payload,
      });
      setForm(emptyForm);
      setCreateOpen(false);
      setRefreshVersion(version => version + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a oportunidade."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function moveOpportunity(opportunity: OpportunityRecord) {
    if (!canMove || movingOpportunityId) {
      return;
    }

    const stageId = stageSelections[opportunity.id] ?? opportunity.stageId;
    if (stageId === opportunity.stageId) {
      return;
    }

    const payload: OpportunityMoveInput = {
      stageId,
      version: opportunity.version,
    };

    setError("");
    setMovingOpportunityId(opportunity.id);

    try {
      await apiRequest<OpportunityRecord>(
        `/opportunities/${opportunity.id}/stage`,
        {
          accessToken,
          method: "PATCH",
          body: payload,
        }
      );
      setStageSelections(current => {
        const next = { ...current };
        delete next[opportunity.id];
        return next;
      });
      setRefreshVersion(version => version + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível mover a oportunidade."
      );
    } finally {
      setMovingOpportunityId(null);
    }
  }

  return (
    <section
      className="opportunities-view"
      aria-labelledby="opportunities-title"
    >
      <header className="opportunities-view__header">
        <div>
          <p className="opportunities-view__eyebrow">Pipeline comercial</p>
          <h1 id="opportunities-title">Oportunidades</h1>
          <p>Acompanhe as negociações comerciais em uma visão objetiva.</p>
        </div>
        {canWrite ? (
          <button
            className="button"
            type="button"
            onClick={() => void openCreate()}
          >
            Nova oportunidade
          </button>
        ) : null}
      </header>

      {canWrite && createOpen ? (
        <form
          className="opportunities-view__create"
          aria-label="Nova oportunidade"
          onSubmit={event => void submitOpportunity(event)}
        >
          <label>
            <span>Título</span>
            <input
              name="title"
              type="text"
              value={form.title}
              onChange={event =>
                setForm(current => ({ ...current, title: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>Cliente</span>
            <select
              name="customer"
              value={form.customer}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  customer: event.target.value,
                }))
              }
              required
            >
              <option value="">Selecione o cliente</option>
              {companies.length > 0 ? (
                <optgroup label="Empresas">
                  {companies.map(company => (
                    <option key={company.id} value={`company:${company.id}`}>
                      {company.tradeName || company.legalName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {contacts.length > 0 ? (
                <optgroup label="Contatos">
                  {contacts.map(contact => (
                    <option key={contact.id} value={`contact:${contact.id}`}>
                      {contact.fullName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <label>
            <span>Funil</span>
            <select
              name="pipelineId"
              value={form.pipelineId}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  pipelineId: event.target.value,
                  stageId: "",
                }))
              }
              required
            >
              <option value="">Selecione o funil</option>
              {pipelines.map(pipeline => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Etapa</span>
            <select
              name="stageId"
              value={form.stageId}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  stageId: event.target.value,
                }))
              }
              required
            >
              <option value="">Selecione a etapa</option>
              {selectedPipeline?.stages.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Valor estimado</span>
            <input
              name="estimatedValue"
              inputMode="decimal"
              value={form.estimatedValue}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  estimatedValue: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            <span>Previsão de fechamento</span>
            <input
              name="expectedCloseAt"
              type="datetime-local"
              value={form.expectedCloseAt}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  expectedCloseAt: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Observações</span>
            <textarea
              name="notes"
              value={form.notes}
              onChange={event =>
                setForm(current => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
          <div className="opportunities-view__create-actions">
            <button className="button" type="submit" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar oportunidade"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="opportunities-view__search"
        role="search"
        onSubmit={submitSearch}
      >
        <label htmlFor="opportunities-search">Buscar oportunidades</label>
        <div>
          <input
            id="opportunities-search"
            type="search"
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
          <button type="submit">Buscar</button>
        </div>
      </form>

      {error ? (
        <p className="opportunities-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="opportunities-view__status">
          Carregando oportunidades...
        </p>
      ) : null}

      {!loading && !error && opportunities.length === 0 ? (
        <div className="opportunities-view__empty">
          <strong>Nenhuma oportunidade encontrada.</strong>
          <span>Ajuste a busca ou aguarde novos registros comerciais.</span>
        </div>
      ) : null}

      {!loading && !error && opportunities.length > 0 ? (
        <ul className="opportunities-view__list">
          {opportunities.map(opportunity => {
            const opportunityPipeline = pipelines.find(
              pipeline => pipeline.id === opportunity.pipelineId
            );
            const selectedStageId =
              stageSelections[opportunity.id] ?? opportunity.stageId;
            const isMoving = movingOpportunityId === opportunity.id;

            return (
              <li key={opportunity.id} className="opportunity-card">
                <article>
                  <p className="opportunity-card__eyebrow">Oportunidade</p>
                  <h2>{opportunity.title}</h2>
                  <dl>
                    <div>
                      <dt>Valor estimado</dt>
                      <dd>{opportunity.estimatedValue}</dd>
                    </div>
                    <div>
                      <dt>Previsão de fechamento</dt>
                      <dd>
                        {opportunity.expectedCloseAt
                          ? dateFormatter.format(
                              new Date(opportunity.expectedCloseAt)
                            )
                          : "Não informada"}
                      </dd>
                    </div>
                  </dl>
                  {canMove && opportunityPipeline ? (
                    <div className="opportunity-card__stage">
                      <label>
                        <span>Etapa</span>
                        <select
                          aria-label={`Etapa de ${opportunity.title}`}
                          value={selectedStageId}
                          disabled={isMoving}
                          onChange={event =>
                            setStageSelections(current => ({
                              ...current,
                              [opportunity.id]: event.target.value,
                            }))
                          }
                        >
                          {opportunityPipeline.stages.map(stage => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={
                          isMoving || selectedStageId === opportunity.stageId
                        }
                        onClick={() => void moveOpportunity(opportunity)}
                      >
                        {isMoving ? "Movendo..." : "Mover etapa"}
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
