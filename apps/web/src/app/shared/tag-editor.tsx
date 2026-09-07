"use client";

import { useMemo, useState } from "react";

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
  const [selectedTagId, setSelectedTagId] = useState("");
  const linkedIds = useMemo(() => new Set(linkedTagIds), [linkedTagIds]);
  const linkedTags = availableTags.filter(tag => linkedIds.has(tag.id));
  const unlinkedTags = availableTags.filter(tag => !linkedIds.has(tag.id));

  return (
    <div className="tag-editor">
      {linkedTags.length > 0 ? (
        <ul className="tag-editor__linked" aria-label="Tags vinculadas">
          {linkedTags.map(tag => (
            <li key={tag.id}>
              <span>{tag.name}</span>
              <button
                type="button"
                aria-label={`Remover tag ${tag.name}`}
                onClick={() => onUnlink(tag.id)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tag-editor__empty">Nenhuma tag vinculada.</p>
      )}

      <div className="tag-editor__add">
        <label>
          <span>Adicionar tag</span>
          <select
            value={selectedTagId}
            onChange={event => setSelectedTagId(event.target.value)}
          >
            <option value="">Selecione</option>
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
        >
          Vincular tag
        </button>
      </div>
    </div>
  );
}
