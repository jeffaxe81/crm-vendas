"use client";

import type {
  OpportunityCreateInput,
  OpportunityMoveInput,
  OpportunityUpdateInput,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { OpportunityItemsPanel, formatMoney } from "./opportunity-items-panel";

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

type StageKind = "OPEN" | "WON" | "LOST";

type StageOption = {
  id: string;
  name: string;
  position: number;
  kind?: StageKind;
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

type OpportunityEditFormState = {
  title: string;
  customer: string;
  estimatedValue: string;
  expectedCloseAt: string;
  notes: string;
};

const emptyEditForm: OpportunityEditFormState = {
  title: "",
  customer: "",
  estimatedValue: "",
  expectedCloseAt: "",
  notes: "",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

function toDateTimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function stageStatusLabel(kind?: StageKind): string {
  if (kind === "WON") {
    return "Ganha";
  }
  if (kind === "LOST") {
    return "Perdida";
  }
  return "Aberta";
}

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
  const [itemsOpportunityId, setItemsOpportunityId] = useState<string | null>(
    null
  );
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [boardPipelineId, setBoardPipelineId] = useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<
    string | null
  >(null);
  const [editingOpportunityId, setEditingOpportunityId] = useState<
    string | null
  >(null);
  const [editForm, setEditForm] =
    useState<OpportunityEditFormState>(emptyEditForm);

  const selectedPipeline = pipelines.find(
    pipeline => pipeline.id === form.pipelineId
  );
  const resolvedBoardPipelineId =
    boardPipelineId || opportunities[0]?.pipelineId || pipelines[0]?.id || "";
  const boardPipeline = pipelines.find(
    pipeline => pipeline.id === resolvedBoardPipelineId
  );
  const boardStages = [...(boardPipeline?.stages ?? [])].sort(
    (left, right) => left.position - right.position
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

    async function loadPipelines() {
      try {
        const result = await apiRequest<PipelineOption[]>("/pipelines", {
          accessToken,
        });
        if (active) {
          setPipelines(result);
        }
      } catch (cause) {
        if (active && (canMove || viewMode === "kanban")) {
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
  }, [accessToken, canMove, viewMode]);

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

    const pipeline = pipelines.find(item => item.id === opportunity.pipelineId);
    const currentStage = pipeline?.stages.find(
      stage => stage.id === opportunity.stageId
    );
    if ((currentStage?.kind ?? "OPEN") !== "OPEN") {
      setError("Oportunidades ganhas ou perdidas não podem ser reabertas.");
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

  async function loadCustomers() {
    const [companyResult, contactResult] = await Promise.all([
      apiRequest<ListResponse<CompanyOption>>("/companies?page=1&limit=100", {
        accessToken,
      }),
      apiRequest<ListResponse<ContactOption>>("/contacts?page=1&limit=100", {
        accessToken,
      }),
    ]);
    setCompanies(companyResult.items);
    setContacts(contactResult.items);
  }

  async function toggleDetails(opportunity: OpportunityRecord) {
    if (selectedOpportunityId === opportunity.id) {
      setSelectedOpportunityId(null);
      return;
    }

    setSelectedOpportunityId(opportunity.id);
    if (companies.length === 0 && contacts.length === 0) {
      try {
        await loadCustomers();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os dados do cliente."
        );
      }
    }
  }

  async function openEdit(opportunity: OpportunityRecord) {
    if (!canWrite) {
      return;
    }

    setError("");
    setEditingOpportunityId(opportunity.id);
    setEditForm({
      title: opportunity.title,
      customer: opportunity.companyId
        ? `company:${opportunity.companyId}`
        : opportunity.contactId
          ? `contact:${opportunity.contactId}`
          : "",
      estimatedValue: opportunity.estimatedValue,
      expectedCloseAt: toDateTimeLocal(opportunity.expectedCloseAt),
      notes: opportunity.notes ?? "",
    });

    try {
      await loadCustomers();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os dados para edição."
      );
    }
  }

  async function submitEdit(
    event: FormEvent<HTMLFormElement>,
    opportunity: OpportunityRecord
  ) {
    event.preventDefault();

    if (!canWrite || submitting) {
      return;
    }

    const title = editForm.title.trim();
    const estimatedValue = editForm.estimatedValue.trim();
    const [customerType, customerId] = editForm.customer.split(":", 2);

    if (!title || !estimatedValue || !customerId) {
      setError("Preencha os campos obrigatórios da oportunidade.");
      return;
    }

    const payload: OpportunityUpdateInput = {
      version: opportunity.version,
    };

    if (title !== opportunity.title) {
      payload.title = title;
    }

    const originalCustomer = opportunity.companyId
      ? `company:${opportunity.companyId}`
      : opportunity.contactId
        ? `contact:${opportunity.contactId}`
        : "";
    if (editForm.customer !== originalCustomer) {
      if (customerType === "company") {
        payload.companyId = customerId;
        payload.contactId = null;
      } else {
        payload.companyId = null;
        payload.contactId = customerId;
      }
    }

    if (estimatedValue !== opportunity.estimatedValue) {
      payload.estimatedValue = estimatedValue;
    }

    if (
      editForm.expectedCloseAt !== toDateTimeLocal(opportunity.expectedCloseAt)
    ) {
      payload.expectedCloseAt = editForm.expectedCloseAt
        ? new Date(editForm.expectedCloseAt).toISOString()
        : null;
    }

    const notes = editForm.notes.trim() || null;
    if (notes !== opportunity.notes) {
      payload.notes = notes;
    }

    if (Object.keys(payload).length === 1) {
      setError("Altere pelo menos um campo antes de salvar.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const updated = await apiRequest<OpportunityRecord>(
        `/opportunities/${opportunity.id}`,
        {
          accessToken,
          method: "PATCH",
          body: payload,
        }
      );
      setOpportunities(current =>
        current.map(item => (item.id === updated.id ? updated : item))
      );
      setEditingOpportunityId(null);
      setEditForm(emptyEditForm);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível editar a oportunidade."
      );
    } finally {
      setSubmitting(false);
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

      <div
        className="opportunities-view__mode"
        aria-label="Visualização de oportunidades"
      >
        <button
          type="button"
          aria-pressed={viewMode === "list"}
          onClick={() => setViewMode("list")}
        >
          Lista
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "kanban"}
          onClick={() => setViewMode("kanban")}
        >
          Funil
        </button>
      </div>

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

      {!loading && !error && opportunities.length > 0 && viewMode === "list" ? (
        <ul className="opportunities-view__list">
          {opportunities.map(opportunity => {
            const opportunityPipeline = pipelines.find(
              pipeline => pipeline.id === opportunity.pipelineId
            );
            const selectedStageId =
              stageSelections[opportunity.id] ?? opportunity.stageId;
            const isMoving = movingOpportunityId === opportunity.id;
            const currentStage = opportunityPipeline?.stages.find(
              stage => stage.id === opportunity.stageId
            );
            const currentStageKind = currentStage?.kind ?? "OPEN";
            const isTerminal =
              currentStageKind === "WON" || currentStageKind === "LOST";
            const company = companies.find(
              item => item.id === opportunity.companyId
            );
            const contact = contacts.find(
              item => item.id === opportunity.contactId
            );
            const customerName = opportunity.companyId
              ? company?.tradeName || company?.legalName || "Empresa vinculada"
              : contact?.fullName || "Contato vinculado";

            return (
              <li key={opportunity.id} className="opportunity-card">
                <article>
                  <div className="opportunity-card__heading">
                    <div>
                      <p className="opportunity-card__eyebrow">Oportunidade</p>
                      <h2>{opportunity.title}</h2>
                    </div>
                    <span
                      className={`opportunity-status opportunity-status--${(
                        currentStage?.kind ?? "OPEN"
                      ).toLowerCase()}`}
                    >
                      {stageStatusLabel(currentStage?.kind)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Valor estimado</dt>
                      <dd>{formatMoney(opportunity.estimatedValue)}</dd>
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
                  {canMove && opportunityPipeline && !isTerminal ? (
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
                  {isTerminal ? (
                    <p className="opportunity-card__terminal-note">
                      Oportunidade encerrada em {currentStage?.name}.
                    </p>
                  ) : null}

                  <div className="opportunity-card__actions">
                    <button
                      type="button"
                      aria-expanded={selectedOpportunityId === opportunity.id}
                      onClick={() => void toggleDetails(opportunity)}
                    >
                      {selectedOpportunityId === opportunity.id
                        ? "Ocultar detalhes"
                        : "Ver detalhes"}
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        aria-expanded={editingOpportunityId === opportunity.id}
                        onClick={() => void openEdit(opportunity)}
                      >
                        {editingOpportunityId === opportunity.id
                          ? "Editando"
                          : "Editar"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={itemsOpportunityId === opportunity.id}
                      onClick={() =>
                        setItemsOpportunityId(current =>
                          current === opportunity.id ? null : opportunity.id
                        )
                      }
                    >
                      {itemsOpportunityId === opportunity.id
                        ? "Ocultar itens"
                        : "Itens"}
                    </button>
                  </div>

                  {selectedOpportunityId === opportunity.id ? (
                    <section
                      className="opportunity-card__details"
                      aria-label={`Detalhes de ${opportunity.title}`}
                    >
                      <dl>
                        <div>
                          <dt>Cliente</dt>
                          <dd>{customerName}</dd>
                        </div>
                        <div>
                          <dt>Funil</dt>
                          <dd>
                            {opportunityPipeline?.name ?? "Não identificado"}
                          </dd>
                        </div>
                        <div>
                          <dt>Etapa</dt>
                          <dd>{currentStage?.name ?? "Não identificada"}</dd>
                        </div>
                        <div>
                          <dt>Responsável</dt>
                          <dd>
                            {opportunity.ownerUserId === ownerUserId
                              ? "Você"
                              : "Outro usuário"}
                          </dd>
                        </div>
                        <div>
                          <dt>Atualizada em</dt>
                          <dd>
                            {dateFormatter.format(
                              new Date(opportunity.updatedAt)
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div>
                        <strong>Observações</strong>
                        <p>{opportunity.notes || "Sem observações."}</p>
                      </div>
                    </section>
                  ) : null}

                  {canWrite && editingOpportunityId === opportunity.id ? (
                    <form
                      className="opportunity-card__edit"
                      aria-label={`Editar ${opportunity.title}`}
                      onSubmit={event => void submitEdit(event, opportunity)}
                    >
                      <label>
                        <span>Título</span>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={event =>
                            setEditForm(current => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>Cliente</span>
                        <select
                          value={editForm.customer}
                          onChange={event =>
                            setEditForm(current => ({
                              ...current,
                              customer: event.target.value,
                            }))
                          }
                          required
                        >
                          <option value="">Selecione o cliente</option>
                          {companies.length > 0 ? (
                            <optgroup label="Empresas">
                              {companies.map(item => (
                                <option
                                  key={item.id}
                                  value={`company:${item.id}`}
                                >
                                  {item.tradeName || item.legalName}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          {contacts.length > 0 ? (
                            <optgroup label="Contatos">
                              {contacts.map(item => (
                                <option
                                  key={item.id}
                                  value={`contact:${item.id}`}
                                >
                                  {item.fullName}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                      </label>
                      <label>
                        <span>Valor estimado</span>
                        <input
                          inputMode="decimal"
                          value={editForm.estimatedValue}
                          onChange={event =>
                            setEditForm(current => ({
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
                          type="datetime-local"
                          value={editForm.expectedCloseAt}
                          onChange={event =>
                            setEditForm(current => ({
                              ...current,
                              expectedCloseAt: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Observações</span>
                        <textarea
                          value={editForm.notes}
                          onChange={event =>
                            setEditForm(current => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="opportunity-card__actions">
                        <button
                          className="button"
                          type="submit"
                          disabled={submitting}
                        >
                          {submitting ? "Salvando..." : "Salvar alterações"}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            setEditingOpportunityId(null);
                            setEditForm(emptyEditForm);
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {itemsOpportunityId === opportunity.id ? (
                    <OpportunityItemsPanel
                      accessToken={accessToken}
                      opportunity={opportunity}
                      canWrite={canWrite}
                      onOpportunityChange={updated =>
                        setOpportunities(current =>
                          current.map(entry =>
                            entry.id === updated.id ? updated : entry
                          )
                        )
                      }
                    />
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && !error && viewMode === "kanban" ? (
        <section
          className="opportunities-view__kanban"
          aria-label="Funil de vendas"
        >
          {pipelines.length > 1 ? (
            <label className="opportunities-view__pipeline-selector">
              <span>Funil</span>
              <select
                value={resolvedBoardPipelineId}
                onChange={event => setBoardPipelineId(event.target.value)}
              >
                {pipelines.map(pipeline => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {boardPipeline ? (
            <div className="opportunities-view__kanban-columns">
              {boardStages.map(stage => {
                const stageOpportunities = opportunities.filter(
                  opportunity =>
                    opportunity.pipelineId === boardPipeline.id &&
                    opportunity.stageId === stage.id
                );

                return (
                  <section
                    key={stage.id}
                    className={`opportunities-view__kanban-column opportunities-view__kanban-column--${stage.kind.toLowerCase()}`}
                    aria-labelledby={`pipeline-stage-${stage.id}`}
                  >
                    <header>
                      <div>
                        <h2 id={`pipeline-stage-${stage.id}`}>{stage.name}</h2>
                        <small>{stageStatusLabel(stage.kind)}</small>
                      </div>
                      <span>{stageOpportunities.length}</span>
                    </header>

                    {stageOpportunities.length === 0 ? (
                      <p>Nenhuma oportunidade nesta etapa.</p>
                    ) : (
                      <ul>
                        {stageOpportunities.map(opportunity => {
                          const selectedStageId =
                            stageSelections[opportunity.id] ??
                            opportunity.stageId;
                          const isMoving =
                            movingOpportunityId === opportunity.id;

                          return (
                            <li key={opportunity.id}>
                              <article className="opportunity-kanban-card">
                                <h3>{opportunity.title}</h3>
                                <strong>
                                  {formatMoney(opportunity.estimatedValue)}
                                </strong>
                                <span>
                                  {opportunity.expectedCloseAt
                                    ? dateFormatter.format(
                                        new Date(opportunity.expectedCloseAt)
                                      )
                                    : "Sem previsão"}
                                </span>

                                <span
                                  className={`opportunity-status opportunity-status--${stage.kind.toLowerCase()}`}
                                >
                                  {stageStatusLabel(stage.kind)}
                                </span>

                                {canMove && stage.kind === "OPEN" ? (
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
                                            [opportunity.id]:
                                              event.target.value,
                                          }))
                                        }
                                      >
                                        {boardStages.map(targetStage => (
                                          <option
                                            key={targetStage.id}
                                            value={targetStage.id}
                                          >
                                            {targetStage.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      type="button"
                                      disabled={
                                        isMoving ||
                                        selectedStageId === opportunity.stageId
                                      }
                                      onClick={() =>
                                        void moveOpportunity(opportunity)
                                      }
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
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <p className="opportunities-view__status">
              Carregando etapas do funil...
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}
