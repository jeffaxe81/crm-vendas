"use client";

import type {
  ContactChannelInput,
  ContactCreateInput,
  RelationshipEntryKind,
} from "@axes/contracts";
import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { TagEditor, type TagEditorItem } from "../shared/tag-editor";

type ContactChannelRecord = {
  id: string;
  organizationId: string;
  contactId: string;
  type: string;
  value: string;
  label: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContactRecord = {
  id: string;
  organizationId: string;
  fullName: string;
  jobTitle: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
  channels?: ContactChannelRecord[];
};

type CompanyRecord = {
  id: string;
  legalName: string;
  tradeName: string | null;
};

type ListResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

type RelationshipEntryRecord = {
  id: string;
  contactId: string | null;
  companyId: string | null;
  kind: RelationshipEntryKind;
  content: string;
  occurredAt: string;
};

type ContactsViewProps = {
  accessToken: string;
};

type ContactFormState = {
  fullName: string;
  jobTitle: string;
};

type ChannelFormState = {
  type: ContactChannelInput["type"];
  value: string;
  label: string;
  isPrimary: boolean;
};

const emptyContactForm: ContactFormState = {
  fullName: "",
  jobTitle: "",
};

const emptyChannelForm: ChannelFormState = {
  type: "EMAIL",
  value: "",
  label: "",
  isPrimary: false,
};

export function ContactsView({ accessToken }: ContactsViewProps) {
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [history, setHistory] = useState<RelationshipEntryRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactForm, setContactForm] =
    useState<ContactFormState>(emptyContactForm);
  const [channelContactId, setChannelContactId] = useState<string | null>(null);
  const [channelForm, setChannelForm] =
    useState<ChannelFormState>(emptyChannelForm);
  const [linkContactId, setLinkContactId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [linkedCompanies, setLinkedCompanies] = useState<
    Record<string, string>
  >({});
  const [historyContactId, setHistoryContactId] = useState<string | null>(null);
  const [historyKind, setHistoryKind] = useState<RelationshipEntryKind>("NOTE");
  const [historyContent, setHistoryContent] = useState("");
  const [tagContactId, setTagContactId] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagEditorItem[]>([]);
  const [linkedTagIdsByContact, setLinkedTagIdsByContact] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      setLoading(true);
      setError("");

      try {
        const [contactResult, companyResult] = await Promise.all([
          apiRequest<ListResponse<ContactRecord>>("/contacts?page=1&limit=20", {
            accessToken,
          }),
          apiRequest<ListResponse<CompanyRecord>>(
            "/companies?page=1&limit=100",
            { accessToken }
          ),
        ]);

        if (active) {
          setContacts(current => {
            const loadedIds = new Set(
              contactResult.items.map(contact => contact.id)
            );
            return [
              ...contactResult.items,
              ...current.filter(contact => !loadedIds.has(contact.id)),
            ];
          });
          setCompanies(companyResult.items);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar os contatos."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      active = false;
    };
  }, [accessToken]);

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const fullName = contactForm.fullName.trim();
    if (!fullName) {
      setError("Informe o nome completo.");
      return;
    }

    try {
      const payload: ContactCreateInput = {
        fullName,
        ...(contactForm.jobTitle.trim()
          ? { jobTitle: contactForm.jobTitle.trim() }
          : {}),
      };
      const created = await apiRequest<ContactRecord>("/contacts", {
        accessToken,
        method: "POST",
        body: payload,
      });
      setContacts(current => [...current, { ...created, channels: [] }]);
      setContactForm(emptyContactForm);
      setContactFormOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o contato."
      );
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelContactId) {
      return;
    }

    setError("");
    try {
      const payload: ContactChannelInput = {
        type: channelForm.type,
        value: channelForm.value.trim(),
        ...(channelForm.label.trim()
          ? { label: channelForm.label.trim() }
          : {}),
        isPrimary: channelForm.isPrimary,
      };
      const created = await apiRequest<ContactChannelRecord>(
        `/contacts/${channelContactId}/channels`,
        {
          accessToken,
          method: "POST",
          body: payload,
        }
      );
      setContacts(current =>
        current.map(contact =>
          contact.id === channelContactId
            ? {
                ...contact,
                channels: [...(contact.channels ?? []), created],
              }
            : contact
        )
      );
      setChannelForm(emptyChannelForm);
      setChannelContactId(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o canal."
      );
    }
  }

  async function linkCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkContactId || !selectedCompanyId) {
      return;
    }

    setError("");
    try {
      await apiRequest(
        `/companies/${selectedCompanyId}/contacts/${linkContactId}`,
        {
          accessToken,
          method: "POST",
          body: {},
        }
      );
      setLinkedCompanies(current => ({
        ...current,
        [linkContactId]: selectedCompanyId,
      }));
      setLinkContactId(null);
      setSelectedCompanyId("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível vincular a empresa."
      );
    }
  }

  async function createHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!historyContactId || !historyContent.trim()) {
      return;
    }

    setError("");
    try {
      const companyId = linkedCompanies[historyContactId];
      const created = await apiRequest<RelationshipEntryRecord>(
        "/relationship-entries",
        {
          accessToken,
          method: "POST",
          body: {
            contactId: historyContactId,
            ...(companyId ? { companyId } : {}),
            kind: historyKind,
            content: historyContent.trim(),
            occurredAt: new Date().toISOString(),
          },
        }
      );
      setHistory(current => [...current, created]);
      setHistoryKind("NOTE");
      setHistoryContent("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar o histórico."
      );
    }
  }

  async function openTagEditor(contactId: string) {
    setError("");

    try {
      const result = await apiRequest<ListResponse<TagEditorItem>>(
        "/tags?page=1&limit=100",
        { accessToken }
      );
      setAvailableTags(result.items);
      setTagContactId(contactId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar as tags."
      );
    }
  }

  async function linkTag(tagId: string) {
    if (!tagContactId) {
      return;
    }

    setError("");
    try {
      await apiRequest(`/contacts/${tagContactId}/tags/${tagId}`, {
        accessToken,
        method: "POST",
        body: {},
      });
      setLinkedTagIdsByContact(current => ({
        ...current,
        [tagContactId]: Array.from(
          new Set([...(current[tagContactId] ?? []), tagId])
        ),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível vincular a tag."
      );
    }
  }

  async function unlinkTag(tagId: string) {
    if (!tagContactId) {
      return;
    }

    setError("");
    try {
      await apiRequest(`/contacts/${tagContactId}/tags/${tagId}`, {
        accessToken,
        method: "DELETE",
      });
      setLinkedTagIdsByContact(current => ({
        ...current,
        [tagContactId]: (current[tagContactId] ?? []).filter(
          linkedTagId => linkedTagId !== tagId
        ),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível remover a tag."
      );
    }
  }

  const taggedContact = tagContactId
    ? contacts.find(contact => contact.id === tagContactId)
    : undefined;

  return (
    <section className="contacts-view" aria-labelledby="contacts-title">
      <header className="contacts-view__header">
        <div>
          <p className="contacts-view__eyebrow">Relacionamento</p>
          <h1 id="contacts-title">Contatos</h1>
          <p>Gerencie pessoas, canais e vínculos comerciais.</p>
        </div>
        <button
          type="button"
          className="button contacts-view__primary"
          onClick={() => setContactFormOpen(true)}
        >
          Novo contato
        </button>
      </header>

      {error ? (
        <p className="contacts-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {contactFormOpen ? (
        <form
          className="contact-form"
          aria-label="Novo contato"
          onSubmit={createContact}
        >
          <label>
            <span>Nome completo</span>
            <input
              value={contactForm.fullName}
              onChange={event =>
                setContactForm(current => ({
                  ...current,
                  fullName: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            <span>Cargo</span>
            <input
              value={contactForm.jobTitle}
              onChange={event =>
                setContactForm(current => ({
                  ...current,
                  jobTitle: event.target.value,
                }))
              }
            />
          </label>
          <button className="button" type="submit">
            Salvar contato
          </button>
        </form>
      ) : null}

      {loading ? <p>Carregando contatos...</p> : null}

      <div className="contacts-view__grid">
        {contacts.map(contact => (
          <article className="contact-card" key={contact.id}>
            <div>
              <p className="contact-card__eyebrow">Contato</p>
              <h2>{contact.fullName}</h2>
              {contact.jobTitle ? <p>{contact.jobTitle}</p> : null}
            </div>

            {(contact.channels ?? []).length > 0 ? (
              <ul className="contact-card__channels">
                {(contact.channels ?? []).map(channel => (
                  <li key={channel.id}>
                    <strong>{channel.type}</strong> {channel.value}
                  </li>
                ))}
              </ul>
            ) : null}

            {history
              .filter(entry => entry.contactId === contact.id)
              .map(entry => (
                <p className="contact-card__history" key={entry.id}>
                  {entry.content}
                </p>
              ))}

            <div className="contact-card__actions">
              <button
                type="button"
                onClick={() => {
                  setChannelContactId(contact.id);
                  setChannelForm(emptyChannelForm);
                }}
              >
                Adicionar canal
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkContactId(contact.id);
                  setSelectedCompanyId("");
                }}
              >
                Vincular empresa
              </button>
              <button
                type="button"
                onClick={() => {
                  setHistoryContactId(contact.id);
                  setHistoryKind("NOTE");
                  setHistoryContent("");
                }}
              >
                Registrar histórico
              </button>
              <button
                type="button"
                onClick={() => void openTagEditor(contact.id)}
              >
                Gerenciar tags
              </button>
            </div>
          </article>
        ))}
      </div>

      {taggedContact ? (
        <section
          className="contact-tags"
          aria-label={`Tags do contato ${taggedContact.fullName}`}
        >
          <TagEditor
            availableTags={availableTags}
            linkedTagIds={linkedTagIdsByContact[taggedContact.id] ?? []}
            onLink={tagId => void linkTag(tagId)}
            onUnlink={tagId => void unlinkTag(tagId)}
          />
        </section>
      ) : null}

      {channelContactId ? (
        <form
          className="contact-form"
          aria-label="Novo canal"
          onSubmit={createChannel}
        >
          <label>
            <span>Tipo</span>
            <select
              value={channelForm.type}
              onChange={event =>
                setChannelForm(current => ({
                  ...current,
                  type: event.target.value as ContactChannelInput["type"],
                }))
              }
            >
              <option value="EMAIL">E-mail</option>
              <option value="PHONE">Telefone</option>
              <option value="MOBILE">Celular</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            <span>Valor</span>
            <input
              value={channelForm.value}
              onChange={event =>
                setChannelForm(current => ({
                  ...current,
                  value: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            <span>Rótulo</span>
            <input
              value={channelForm.label}
              onChange={event =>
                setChannelForm(current => ({
                  ...current,
                  label: event.target.value,
                }))
              }
            />
          </label>
          <label className="contact-form__checkbox">
            <input
              type="checkbox"
              checked={channelForm.isPrimary}
              onChange={event =>
                setChannelForm(current => ({
                  ...current,
                  isPrimary: event.target.checked,
                }))
              }
            />
            <span>Canal principal</span>
          </label>
          <button className="button" type="submit">
            Salvar canal
          </button>
        </form>
      ) : null}

      {linkContactId ? (
        <form
          className="contact-form"
          aria-label="Vincular empresa"
          onSubmit={linkCompany}
        >
          <label>
            <span>Empresa</span>
            <select
              value={selectedCompanyId}
              onChange={event => setSelectedCompanyId(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>
                  {company.tradeName || company.legalName}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Confirmar vínculo
          </button>
        </form>
      ) : null}

      {historyContactId ? (
        <form
          className="contact-form"
          aria-label="Registrar histórico"
          onSubmit={createHistory}
        >
          <label>
            <span>Tipo</span>
            <select
              value={historyKind}
              onChange={event =>
                setHistoryKind(event.target.value as RelationshipEntryKind)
              }
            >
              <option value="NOTE">Nota</option>
              <option value="CALL_NOTE">Ligação</option>
              <option value="EMAIL_NOTE">E-mail</option>
              <option value="MEETING_NOTE">Reunião</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            <span>Registro</span>
            <textarea
              value={historyContent}
              onChange={event => setHistoryContent(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit">
            Salvar histórico
          </button>
        </form>
      ) : null}
    </section>
  );
}
