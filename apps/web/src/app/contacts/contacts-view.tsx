"use client";

import {
  SaveButton,
  SaveNotice,
  useSaveFeedback,
} from "../../components/save-feedback";

import type {
  ContactChannelInput,
  ContactCreateInput,
  RelationshipEntryKind,
} from "@axes/contracts";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { downloadLoadedVcards } from "../../lib/local-productivity-export";
import { ContactImportPanel } from "./contact-import-panel";
import {
  CustomFieldsEditor,
  type CustomFieldDefinitionView,
} from "../shared/custom-fields-editor";
import { TagEditor, type TagEditorItem } from "../shared/tag-editor";
import { useTranslation } from "../../i18n/language-provider";

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
  relationshipEntries?: RelationshipEntryRecord[];
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

type ContactCustomFieldValueRecord = {
  definitionId: string;
  value: unknown;
};

type ContactsViewProps = {
  accessToken: string;
  canWrite?: boolean;
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

export function ContactsView({
  accessToken,
  canWrite = true,
}: ContactsViewProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<
    "all" | "with-channel" | "without-channel"
  >("all");
  const [contactSort, setContactSort] = useState<
    "recent" | "name-asc" | "name-desc"
  >("recent");
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [history, setHistory] = useState<RelationshipEntryRecord[]>([]);
  const contactSave = useSaveFeedback();
  const channelSave = useSaveFeedback();
  const historySave = useSaveFeedback();
  const fieldsSave = useSaveFeedback();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
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
  const [customFieldsContactId, setCustomFieldsContactId] = useState<
    string | null
  >(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<
    CustomFieldDefinitionView[]
  >([]);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, unknown>
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
          setHistory(
            contactResult.items.flatMap(
              contact => contact.relationshipEntries ?? []
            )
          );
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

  async function reloadContacts() {
    const contactResult = await apiRequest<ListResponse<ContactRecord>>(
      "/contacts?page=1&limit=20",
      { accessToken }
    );
    setContacts(contactResult.items);
    setHistory(
      contactResult.items.flatMap(contact => contact.relationshipEntries ?? [])
    );
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const fullName = contactForm.fullName.trim();
    if (!fullName) {
      setError(t("Informe o nome completo."));
      return;
    }

    if (!contactSave.start()) return;
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
      contactSave.saved();
      setContacts(current => [...current, { ...created, channels: [] }]);
      setContactForm(emptyContactForm);
      setContactFormOpen(false);
    } catch (cause) {
      contactSave.failed();
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
    if (!channelSave.start()) return;
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
      channelSave.saved();
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
      channelSave.failed();
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
    if (!historySave.start()) return;
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
      historySave.saved();
      setHistory(current => [...current, created]);
      setHistoryKind("NOTE");
      setHistoryContent("");
    } catch (cause) {
      historySave.failed();
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

  async function openCustomFields(contactId: string) {
    setError("");

    try {
      const [definitions, storedValues] = await Promise.all([
        apiRequest<CustomFieldDefinitionView[]>(
          "/custom-fields?scope=CONTACT",
          { accessToken }
        ),
        apiRequest<ContactCustomFieldValueRecord[]>(
          `/contacts/${contactId}/custom-fields`,
          { accessToken }
        ),
      ]);
      setCustomFieldDefinitions(definitions);
      setCustomFieldValues(
        Object.fromEntries(
          storedValues.map(stored => [stored.definitionId, stored.value])
        )
      );
      setCustomFieldsContactId(contactId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os campos customizados."
      );
    }
  }

  async function saveCustomFields() {
    if (!customFieldsContactId) {
      return;
    }

    setError("");
    if (!fieldsSave.start()) return;
    try {
      await Promise.all(
        Object.entries(customFieldValues).map(([definitionId, value]) =>
          apiRequest(
            `/contacts/${customFieldsContactId}/custom-fields/${definitionId}`,
            {
              accessToken,
              method: "PUT",
              body: { value },
            }
          )
        )
      );
      fieldsSave.saved();
    } catch (cause) {
      fieldsSave.failed();
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar os campos customizados."
      );
    }
  }

  const visibleContacts = useMemo(() => {
    const normalizedSearch = contactSearch.trim().toLocaleLowerCase("pt-BR");
    return contacts
      .filter(contact => {
        const hasChannel = (contact.channels ?? []).length > 0;
        if (channelFilter === "with-channel" && !hasChannel) return false;
        if (channelFilter === "without-channel" && hasChannel) return false;
        if (!normalizedSearch) return true;
        return [
          contact.fullName,
          contact.jobTitle ?? "",
          ...(contact.channels ?? []).flatMap(channel => [
            channel.value,
            channel.label ?? "",
          ]),
        ].some(value =>
          value.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
        );
      })
      .sort((a, b) => {
        if (contactSort === "name-asc") {
          return a.fullName.localeCompare(b.fullName, "pt-BR");
        }
        if (contactSort === "name-desc") {
          return b.fullName.localeCompare(a.fullName, "pt-BR");
        }
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
  }, [contacts, contactSearch, channelFilter, contactSort]);

  const taggedContact = tagContactId
    ? contacts.find(contact => contact.id === tagContactId)
    : undefined;
  const customFieldsContact = customFieldsContactId
    ? contacts.find(contact => contact.id === customFieldsContactId)
    : undefined;

  return (
    <section className="contacts-view" aria-labelledby="contacts-title">
      <SaveNotice status={contactSave.status} label={t("Contato salvo.")} />
      <SaveNotice status={channelSave.status} label={t("Canal salvo.")} />
      <SaveNotice status={historySave.status} label={t("Histórico salvo.")} />
      <SaveNotice
        status={fieldsSave.status}
        label={t("Campos customizados salvos.")}
      />
      <header className="contacts-view__header">
        <div>
          <p className="contacts-view__eyebrow">{t("Relacionamento")}</p>
          <h1 id="contacts-title">{t("Contatos")}</h1>
          <p>{t("Gerencie pessoas, canais e vínculos comerciais.")}</p>
        </div>
        <div className="companies-view__header-actions">
          <button
            type="button"
            disabled={loading || visibleContacts.length === 0}
            title={t(
              "Exporta somente os contatos visíveis pelos filtros locais"
            )}
            onClick={() =>
              downloadLoadedVcards("crm-contatos-visiveis.vcf", visibleContacts)
            }
          >
            {t("Exportar contatos VCF")}
          </button>
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                importInput.current?.click();
              }}
            >
              {t("Importar CSV")}
            </button>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              className="button contacts-view__primary"
              onClick={() => {
                setImportOpen(false);
                contactSave.reset();
                setContactFormOpen(true);
              }}
            >
              {t("Novo contato")}
            </button>
          ) : null}
        </div>
      </header>

      {canWrite ? (
        <ContactImportPanel
          open={importOpen}
          inputRef={importInput}
          onSelected={() => {
            setContactFormOpen(false);
            setImportOpen(true);
          }}
          accessToken={accessToken}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            try {
              await reloadContacts();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível atualizar a lista de contatos."
              );
            }
          }}
        />
      ) : null}

      {error ? (
        <p className="contacts-view__error" role="alert">
          {t(error)}
        </p>
      ) : null}

      {contactFormOpen ? (
        <form
          className="contact-form"
          aria-label={t("Novo contato")}
          onSubmit={createContact}
        >
          <label>
            <span>{t("Nome completo")}</span>
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
            <span>{t("Cargo")}</span>
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
          <SaveButton
            type="submit"
            status={contactSave.status}
            label={t("Salvar contato")}
          />
        </form>
      ) : null}

      <div className="contacts-view__filters" role="search">
        <label>
          <span>{t("Buscar contatos carregados")}</span>
          <input
            type="search"
            value={contactSearch}
            onChange={event => setContactSearch(event.target.value)}
            placeholder={t("Nome, cargo, e-mail ou telefone")}
          />
        </label>
        <label>
          <span>{t("Canais de contato")}</span>
          <select
            value={channelFilter}
            onChange={event =>
              setChannelFilter(
                event.target.value as
                  | "all"
                  | "with-channel"
                  | "without-channel"
              )
            }
          >
            <option value="all">{t("Todos os contatos")}</option>
            <option value="with-channel">{t("Com canal")}</option>
            <option value="without-channel">{t("Sem canal")}</option>
          </select>
        </label>
        <label>
          <span>{t("Ordenar contatos")}</span>
          <select
            value={contactSort}
            onChange={event =>
              setContactSort(
                event.target.value as "recent" | "name-asc" | "name-desc"
              )
            }
          >
            <option value="recent">{t("Atualizados recentemente")}</option>
            <option value="name-asc">{t("Nome A-Z")}</option>
            <option value="name-desc">{t("Nome Z-A")}</option>
          </select>
        </label>
        <button
          type="button"
          disabled={
            !contactSearch &&
            channelFilter === "all" &&
            contactSort === "recent"
          }
          onClick={() => {
            setContactSearch("");
            setChannelFilter("all");
            setContactSort("recent");
          }}
        >
          {t("Limpar filtros")}
        </button>
        <p aria-live="polite">
          {visibleContacts.length} {t("de")} {contacts.length}{" "}
          {t("contatos carregados")}
        </p>
      </div>

      {loading ? <p>{t("Carregando contatos...")}</p> : null}

      {!loading && visibleContacts.length === 0 ? (
        <p className="contacts-view__empty">
          {t("Nenhum contato corresponde aos filtros atuais.")}
        </p>
      ) : null}

      <div className="contacts-view__grid">
        {visibleContacts.map(contact => (
          <article className="contact-card" key={contact.id}>
            <div>
              <p className="contact-card__eyebrow">{t("Contato")}</p>
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
                  channelSave.reset();
                  setChannelContactId(contact.id);
                  setChannelForm(emptyChannelForm);
                }}
              >
                {t("Adicionar canal")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkContactId(contact.id);
                  setSelectedCompanyId("");
                }}
              >
                {t("Vincular empresa")}
              </button>
              <button
                type="button"
                onClick={() => {
                  historySave.reset();
                  setHistoryContactId(contact.id);
                  setHistoryKind("NOTE");
                  setHistoryContent("");
                }}
              >
                {t("Registrar histórico")}
              </button>
              <button
                type="button"
                onClick={() => void openTagEditor(contact.id)}
              >
                {t("Gerenciar tags")}
              </button>
              <button
                type="button"
                onClick={() => void openCustomFields(contact.id)}
              >
                {t("Campos customizados")}
              </button>
            </div>
          </article>
        ))}
      </div>

      {taggedContact ? (
        <section
          className="contact-tags"
          aria-label={t("Tags do contato {0}", { 0: taggedContact.fullName })}
        >
          <TagEditor
            availableTags={availableTags}
            linkedTagIds={linkedTagIdsByContact[taggedContact.id] ?? []}
            onLink={tagId => void linkTag(tagId)}
            onUnlink={tagId => void unlinkTag(tagId)}
          />
        </section>
      ) : null}

      {customFieldsContact ? (
        <section
          className="contact-custom-fields"
          aria-label={t("Campos customizados do contato {0}", {
            0: customFieldsContact.fullName,
          })}
        >
          <CustomFieldsEditor
            definitions={customFieldDefinitions}
            values={customFieldValues}
            onChange={(definitionId, value) =>
              setCustomFieldValues(current => ({
                ...current,
                [definitionId]: value,
              }))
            }
          />
          <SaveButton
            type="button"
            onClick={() => void saveCustomFields()}
            status={fieldsSave.status}
            label={t("Salvar campos customizados")}
          />
        </section>
      ) : null}

      {channelContactId ? (
        <form
          className="contact-form"
          aria-label={t("Novo canal")}
          onSubmit={createChannel}
        >
          <label>
            <span>{t("Tipo")}</span>
            <select
              value={channelForm.type}
              onChange={event =>
                setChannelForm(current => ({
                  ...current,
                  type: event.target.value as ContactChannelInput["type"],
                }))
              }
            >
              <option value="EMAIL">{t("E-mail")}</option>
              <option value="PHONE">{t("Telefone")}</option>
              <option value="MOBILE">{t("Celular")}</option>
              <option value="WHATSAPP">{t("WhatsApp")}</option>
              <option value="OTHER">{t("Outro")}</option>
            </select>
          </label>
          <label>
            <span>{t("Valor")}</span>
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
            <span>{t("Rótulo")}</span>
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
            <span>{t("Canal principal")}</span>
          </label>
          <SaveButton
            type="submit"
            status={channelSave.status}
            label={t("Salvar canal")}
          />
        </form>
      ) : null}

      {linkContactId ? (
        <form
          className="contact-form"
          aria-label={t("Vincular empresa")}
          onSubmit={linkCompany}
        >
          <label>
            <span>{t("Empresa")}</span>
            <select
              value={selectedCompanyId}
              onChange={event => setSelectedCompanyId(event.target.value)}
              required
            >
              <option value="">{t("Selecione")}</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>
                  {company.tradeName || company.legalName}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            {t("Confirmar vínculo")}
          </button>
        </form>
      ) : null}

      {historyContactId ? (
        <form
          className="contact-form"
          aria-label={t("Registrar histórico")}
          onSubmit={createHistory}
        >
          <label>
            <span>{t("Tipo")}</span>
            <select
              value={historyKind}
              onChange={event =>
                setHistoryKind(event.target.value as RelationshipEntryKind)
              }
            >
              <option value="NOTE">{t("Nota")}</option>
              <option value="CALL_NOTE">{t("Ligação")}</option>
              <option value="EMAIL_NOTE">{t("E-mail")}</option>
              <option value="MEETING_NOTE">{t("Reunião")}</option>
              <option value="OTHER">{t("Outro")}</option>
            </select>
          </label>
          <label>
            <span>{t("Registro")}</span>
            <textarea
              value={historyContent}
              onChange={event => setHistoryContent(event.target.value)}
              required
            />
          </label>
          <SaveButton
            type="submit"
            status={historySave.status}
            label={t("Salvar histórico")}
          />
        </form>
      ) : null}
    </section>
  );
}
