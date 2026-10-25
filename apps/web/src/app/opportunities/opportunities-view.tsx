"use client";

import type {
  OpportunityCreateInput,
  OpportunityMoveInput,
  OpportunityUpdateInput,
} from "@axes/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { downloadLoadedCsv } from "../../lib/local-productivity-export";
import { OpportunityItemsPanel, formatMoney } from "./opportunity-items-panel";
import { useTranslation } from "../../i18n/language-provider";

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
  const { t } = useTranslation();
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
  const [localCustomerFilter, setLocalCustomerFilter] = useState<
    "all" | "company" | "contact"
  >("all");
  const [localCloseFilter, setLocalCloseFilter] = useState<
    "all" | "overdue" | "this-month" | "unscheduled"
  >("all");
  const [localSort, setLocalSort] = useState<
    "updated" | "title" | "close-date"
  >("updated");
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
      setError(t("Preencha os campos obrigatórios da oportunidade."));
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
      setError(t("Oportunidades ganhas ou perdidas não podem ser reabertas."));
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
      setError(t("Preencha os campos obrigatórios da oportunidade."));
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
      setError(t("Altere pelo menos um campo antes de salvar."));
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

  const visibleOpportunities = useMemo(() => {
    const now = new Date();
    return opportunities
      .filter(opportunity => {
        if (localCustomerFilter === "company" && !opportunity.companyId)
          return false;
        if (localCustomerFilter === "contact" && !opportunity.contactId)
          return false;
        if (localCloseFilter === "unscheduled")
          return opportunity.expectedCloseAt === null;
        if (localCloseFilter !== "all") {
          if (!opportunity.expectedCloseAt) return false;
          const expected = new Date(opportunity.expectedCloseAt);
          if (localCloseFilter === "overdue") {
            const stage = pipelines
              .find(item => item.id === opportunity.pipelineId)
              ?.stages.find(item => item.id === opportunity.stageId);
            return (stage?.kind ?? "OPEN") === "OPEN" && expected < now;
          }
          return (
            expected.getFullYear() === now.getFullYear() &&
            expected.getMonth() === now.getMonth()
          );
        }
        return true;
      })
      .sort((left, right) => {
        if (localSort === "title")
          return left.title.localeCompare(right.title, "pt-BR");
        if (localSort === "close-date") {
          const leftDate = left.expectedCloseAt
            ? new Date(left.expectedCloseAt).getTime()
            : Number.POSITIVE_INFINITY;
          const rightDate = right.expectedCloseAt
            ? new Date(right.expectedCloseAt).getTime()
            : Number.POSITIVE_INFINITY;
          return leftDate - rightDate;
        }
        return (
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime()
        );
      });
  }, [
    opportunities,
    localCustomerFilter,
    localCloseFilter,
    localSort,
    pipelines,
  ]);

  return (
    <section
      className="opportunities-view"
      aria-labelledby="opportunities-title"
    >
      <header className="opportunities-view__header">
        <div>
          <p className="opportunities-view__eyebrow">
            {t("Pipeline comercial")}
          </p>
          <h1 id="opportunities-title">{t("Oportunidades")}</h1>
          <p>
            {t("Acompanhe as negociações comerciais em uma visão objetiva.")}
          </p>
        </div>
        <div className="companies-view__header-actions">
          <button
            type="button"
            disabled={loading || visibleOpportunities.length === 0}
            title={t("Exporta somente as negociações visíveis nesta página")}
            onClick={() =>
              downloadLoadedCsv(
                "crm-oportunidades-visiveis.csv",
                [
                  "Título",
                  "Valor estimado",
                  "Previsão de fechamento",
                  "Cliente",
                  "Observações",
                ],
                visibleOpportunities.map(opportunity => [
                  opportunity.title,
                  opportunity.estimatedValue,
                  opportunity.expectedCloseAt,
                  opportunity.companyId ? "Empresa" : "Contato",
                  opportunity.notes,
                ])
              )
            }
          >
            {t("Exportar oportunidades CSV")}
          </button>
          {canWrite ? (
            <button
              className="button"
              type="button"
              onClick={() => void openCreate()}
            >
              {t("Nova oportunidade")}
            </button>
          ) : null}
        </div>
      </header>

      {canWrite && createOpen ? (
        <form
          className="opportunities-view__create"
          aria-label={t("Nova oportunidade")}
          onSubmit={event => void submitOpportunity(event)}
        >
          <label>
            <span>{t("Título")}</span>
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
            <span>{t("Cliente")}</span>
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
              <option value="">{t("Selecione o cliente")}</option>
              {companies.length > 0 ? (
                <optgroup label={t("Empresas")}>
                  {companies.map(company => (
                    <option key={company.id} value={`company:${company.id}`}>
                      {company.tradeName || company.legalName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {contacts.length > 0 ? (
                <optgroup label={t("Contatos")}>
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
            <span>{t("Funil")}</span>
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
              <option value="">{t("Selecione o funil")}</option>
              {pipelines.map(pipeline => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Etapa")}</span>
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
              <option value="">{t("Selecione a etapa")}</option>
              {selectedPipeline?.stages.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Valor estimado")}</span>
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
            <span>{t("Previsão de fechamento")}</span>
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
            <span>{t("Observações")}</span>
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
              {submitting ? t("Salvando...") : t("Salvar oportunidade")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCreateOpen(false)}
            >
              {t("Cancelar")}
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="opportunities-view__search"
        role="search"
        onSubmit={submitSearch}
      >
        <label htmlFor="opportunities-search">
          {t("Buscar oportunidades")}
        </label>
        <div>
          <input
            id="opportunities-search"
            type="search"
            value={queryInput}
            onChange={event => setQueryInput(event.target.value)}
          />
          <button type="submit">{t("Buscar")}</button>
        </div>
      </form>

      <div
        className="opportunities-view__mode"
        aria-label={t("Visualização de oportunidades")}
      >
        <button
          type="button"
          aria-pressed={viewMode === "list"}
          onClick={() => setViewMode("list")}
        >
          {t("Lista")}
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "kanban"}
          onClick={() => setViewMode("kanban")}
        >
          {t("Funil")}
        </button>
      </div>

      {viewMode === "list" ? (
        <div className="opportunities-view__local-filters">
          <label>
            <span>{t("Tipo de cliente")}</span>
            <select
              value={localCustomerFilter}
              onChange={event =>
                setLocalCustomerFilter(
                  event.target.value as "all" | "company" | "contact"
                )
              }
            >
              <option value="all">{t("Todos")}</option>
              <option value="company">{t("Empresas")}</option>
              <option value="contact">{t("Contatos")}</option>
            </select>
          </label>
          <label>
            <span>{t("Previsão de fechamento")}</span>
            <select
              value={localCloseFilter}
              onChange={event =>
                setLocalCloseFilter(
                  event.target.value as
                    "all" | "overdue" | "this-month" | "unscheduled"
                )
              }
            >
              <option value="all">{t("Todas")}</option>
              <option value="overdue">{t("Em atraso")}</option>
              <option value="this-month">{t("Neste mês")}</option>
              <option value="unscheduled">{t("Sem previsão")}</option>
            </select>
          </label>
          <label>
            <span>{t("Ordenar oportunidades")}</span>
            <select
              value={localSort}
              onChange={event =>
                setLocalSort(
                  event.target.value as "updated" | "title" | "close-date"
                )
              }
            >
              <option value="updated">{t("Atualizadas recentemente")}</option>
              <option value="title">{t("Título A-Z")}</option>
              <option value="close-date">{t("Previsão mais próxima")}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={
              localCustomerFilter === "all" &&
              localCloseFilter === "all" &&
              localSort === "updated"
            }
            onClick={() => {
              setLocalCustomerFilter("all");
              setLocalCloseFilter("all");
              setLocalSort("updated");
            }}
          >
            {t("Limpar filtros")}
          </button>
          <p aria-live="polite">
            {visibleOpportunities.length} {t("de")} {opportunities.length}{" "}
            {t("oportunidades carregadas")}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="opportunities-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {loading ? (
        <p className="opportunities-view__status">
          {t("Carregando oportunidades...")}
        </p>
      ) : null}

      {!loading && !error && opportunities.length === 0 ? (
        <div className="opportunities-view__empty">
          <strong>{t("Nenhuma oportunidade encontrada.")}</strong>
          <span>
            {t("Ajuste a busca ou aguarde novos registros comerciais.")}
          </span>
        </div>
      ) : null}

      {!loading &&
      !error &&
      viewMode === "list" &&
      opportunities.length > 0 &&
      visibleOpportunities.length === 0 ? (
        <p className="opportunities-view__status">
          {t("Nenhuma oportunidade corresponde aos filtros locais.")}
        </p>
      ) : null}

      {!loading &&
      !error &&
      visibleOpportunities.length > 0 &&
      viewMode === "list" ? (
        <ul className="opportunities-view__list">
          {visibleOpportunities.map(opportunity => {
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
                      <p className="opportunity-card__eyebrow">
                        {t("Oportunidade")}
                      </p>
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
                      <dt>{t("Valor estimado")}</dt>
                      <dd>{formatMoney(opportunity.estimatedValue)}</dd>
                    </div>
                    <div>
                      <dt>{t("Previsão de fechamento")}</dt>
                      <dd>
                        {opportunity.expectedCloseAt
                          ? dateFormatter.format(
                              new Date(opportunity.expectedCloseAt)
                            )
                          : t("Não informada")}
                      </dd>
                    </div>
                  </dl>
                  {canMove && opportunityPipeline && !isTerminal ? (
                    <div className="opportunity-card__stage">
                      <label>
                        <span>{t("Etapa")}</span>
                        <select
                          aria-label={t("Etapa de {0}", {
                            0: opportunity.title,
                          })}
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
                        {isMoving ? t("Movendo...") : t("Mover etapa")}
                      </button>
                    </div>
                  ) : null}
                  {isTerminal ? (
                    <p className="opportunity-card__terminal-note">
                      {t("Oportunidade encerrada em ")}
                      {currentStage?.name}.
                    </p>
                  ) : null}

                  <div className="opportunity-card__actions">
                    <button
                      type="button"
                      aria-expanded={selectedOpportunityId === opportunity.id}
                      onClick={() => void toggleDetails(opportunity)}
                    >
                      {selectedOpportunityId === opportunity.id
                        ? t("Ocultar detalhes")
                        : t("Ver detalhes")}
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        aria-expanded={editingOpportunityId === opportunity.id}
                        onClick={() => void openEdit(opportunity)}
                      >
                        {editingOpportunityId === opportunity.id
                          ? t("Editando")
                          : t("Editar")}
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
                        ? t("Ocultar itens")
                        : t("Itens")}
                    </button>
                  </div>

                  {selectedOpportunityId === opportunity.id ? (
                    <section
                      className="opportunity-card__details"
                      aria-label={t("Detalhes de {0}", {
                        0: opportunity.title,
                      })}
                    >
                      <dl>
                        <div>
                          <dt>{t("Cliente")}</dt>
                          <dd>{customerName}</dd>
                        </div>
                        <div>
                          <dt>{t("Funil")}</dt>
                          <dd>
                            {opportunityPipeline?.name ?? t("Não identificado")}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Etapa")}</dt>
                          <dd>{currentStage?.name ?? t("Não identificada")}</dd>
                        </div>
                        <div>
                          <dt>{t("Responsável")}</dt>
                          <dd>
                            {opportunity.ownerUserId === ownerUserId
                              ? t("Você")
                              : t("Outro usuário")}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("Atualizada em")}</dt>
                          <dd>
                            {dateFormatter.format(
                              new Date(opportunity.updatedAt)
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div>
                        <strong>{t("Observações")}</strong>
                        <p>{opportunity.notes || t("Sem observações.")}</p>
                      </div>
                    </section>
                  ) : null}

                  {canWrite && editingOpportunityId === opportunity.id ? (
                    <form
                      className="opportunity-card__edit"
                      aria-label={t("Editar {0}", { 0: opportunity.title })}
                      onSubmit={event => void submitEdit(event, opportunity)}
                    >
                      <label>
                        <span>{t("Título")}</span>
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
                        <span>{t("Cliente")}</span>
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
                          <option value="">{t("Selecione o cliente")}</option>
                          {companies.length > 0 ? (
                            <optgroup label={t("Empresas")}>
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
                            <optgroup label={t("Contatos")}>
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
                        <span>{t("Valor estimado")}</span>
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
                        <span>{t("Previsão de fechamento")}</span>
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
                        <span>{t("Observações")}</span>
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
                          {submitting
                            ? t("Salvando...")
                            : t("Salvar alterações")}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            setEditingOpportunityId(null);
                            setEditForm(emptyEditForm);
                          }}
                        >
                          {t("Cancelar")}
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
          aria-label={t("Funil de vendas")}
        >
          {pipelines.length > 1 ? (
            <label className="opportunities-view__pipeline-selector">
              <span>{t("Funil")}</span>
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
                const stageKind = stage.kind ?? "OPEN";
                const stageOpportunities = opportunities.filter(
                  opportunity =>
                    opportunity.pipelineId === boardPipeline.id &&
                    opportunity.stageId === stage.id
                );

                return (
                  <section
                    key={stage.id}
                    className={`opportunities-view__kanban-column opportunities-view__kanban-column--${stageKind.toLowerCase()}`}
                    aria-labelledby={`pipeline-stage-${stage.id}`}
                  >
                    <header>
                      <div>
                        <h2 id={`pipeline-stage-${stage.id}`}>{stage.name}</h2>
                        <small>{stageStatusLabel(stageKind)}</small>
                      </div>
                      <span>{stageOpportunities.length}</span>
                    </header>

                    {stageOpportunities.length === 0 ? (
                      <p>{t("Nenhuma oportunidade nesta etapa.")}</p>
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
                                    : t("Sem previsão")}
                                </span>

                                <span
                                  className={`opportunity-status opportunity-status--${stageKind.toLowerCase()}`}
                                >
                                  {stageStatusLabel(stageKind)}
                                </span>

                                {canMove && stageKind === "OPEN" ? (
                                  <div className="opportunity-card__stage">
                                    <label>
                                      <span>{t("Etapa")}</span>
                                      <select
                                        aria-label={t("Etapa de {0}", {
                                          0: opportunity.title,
                                        })}
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
                                      {isMoving
                                        ? t("Movendo...")
                                        : t("Mover etapa")}
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
              {t("Carregando etapas do funil...")}
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}
