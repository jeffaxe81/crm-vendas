"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/language-provider";


export type TagEditorItem = {
  id: string;
  name: string;
};

type TagEditorProps = {
  availableTags: TagEditorItem[];
  linkedTagIds: string[];
  onLink: (tagId: string) => void;
  onUnlink: (tagId: string) => void;
};

export function TagEditor({
  availableTags,
  linkedTagIds,
  onLink,
  onUnlink,
}: TagEditorProps) {
  const { t } = useTranslation();
  const [selectedTagId, setSelectedTagId] = useState("");
  const linkedIds = useMemo(() => new Set(linkedTagIds), [linkedTagIds]);
  const linkedTags = availableTags.filter(tag => linkedIds.has(tag.id));
  const unlinkedTags = availableTags.filter(tag => !linkedIds.has(tag.id));

  return (
    <div className="tag-editor">
      {linkedTags.length > 0 ? (
        <ul className="tag-editor__linked" aria-label={t("Tags vinculadas")}>
          {linkedTags.map(tag => (
            <li key={tag.id}>
              <span>{tag.name}</span>
              <button
                type="button"
                aria-label={t("Remover tag {0}", {0: tag.name})}
                onClick={() => onUnlink(tag.id)}
              >{t("Remover")}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tag-editor__empty">{t("Nenhuma tag vinculada.")}</p>
      )}

      <div className="tag-editor__add">
        <label>
          <span>{t("Adicionar tag")}</span>
          <select
            value={selectedTagId}
            onChange={event => setSelectedTagId(event.target.value)}
          >
            <option value="">{t("Selecione")}</option>
            {unlinkedTags.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedTagId}
          onClick={() => {
            if (!selectedTagId) {
              return;
            }
            onLink(selectedTagId);
            setSelectedTagId("");
          }}
        >{t("Vincular tag")}</button>
      </div>
    </div>
  );
}
