import { useEffect, useRef, useState } from 'react';

interface Args {
  notes: string | null;
  isUpdating: boolean;
  updateError: string | null;
  entryId: number;
  onUpdateNotes: (id: number, notes: string | null) => void;
}

export function useWatchlistItemNotes({
  notes,
  isUpdating,
  updateError,
  entryId,
  onUpdateNotes,
}: Args) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const [savePending, setSavePending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [trackedNotes, setTrackedNotes] = useState(notes);
  const [trackedEditing, setTrackedEditing] = useState(editing);
  if (notes !== trackedNotes || editing !== trackedEditing) {
    setTrackedNotes(notes);
    setTrackedEditing(editing);
    if (!editing) setDraft(notes ?? '');
  }

  const [trackedIsUpdating, setTrackedIsUpdating] = useState(isUpdating);
  if (isUpdating !== trackedIsUpdating) {
    setTrackedIsUpdating(isUpdating);
    if (savePending && !isUpdating) {
      setSavePending(false);
      if (!updateError) setEditing(false);
    }
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    setSavePending(true);
    onUpdateNotes(entryId, trimmed || null);
  };

  const handleCancel = () => {
    setDraft(notes ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape' && !isUpdating) {
      handleCancel();
    }
  };

  return {
    editing,
    setEditing,
    draft,
    setDraft,
    textareaRef,
    handleSave,
    handleCancel,
    handleKeyDown,
  };
}
