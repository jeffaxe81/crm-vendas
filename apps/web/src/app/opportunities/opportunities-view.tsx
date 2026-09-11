"use client";

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

type OpportunityListResponse = {
  items: OpportunityRecord[];
  page: number;
  limit: number;
  total: number;
};

type OpportunitiesViewProps = {
  accessToken: string;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

export function OpportunitiesView({ accessToken }: OpportunitiesViewProps) {
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [accessToken, query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput.trim());
  }

  return (
    <section className="opportunities-view" aria-labelledby="opportunities-title">
      <header className="opportunities-view__header">
        <div>
          <p className="opportunities-view__eyebrow">Pipeline comercial</p>
          <h1 id="opportunities-title">Oportunidades</h1>
          <p>Acompanhe as negociações comerciais em uma visão objetiva.</p>
        </div>
      </header>

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
        <p className="opportunities-view__status">Carregando oportunidades...</p>
      ) : null}

      {!loading && !error && opportunities.length === 0 ? (
        <div className="opportunities-view__empty">
          <strong>Nenhuma oportunidade encontrada.</strong>
          <span>Ajuste a busca ou aguarde novos registros comerciais.</span>
        </div>
      ) : null}

      {!loading && !error && opportunities.length > 0 ? (
        <ul className="opportunities-view__list">
          {opportunities.map(opportunity => (
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
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
