import { type Entity } from '@/fixtures/entities';
import { useState } from 'react';

/**
 * Owns the open/target state for one `EntityFormDialog` and a `key` that
 * bumps on every open, passed straight through to the dialog. The dialog
 * seeds its fields from `entity` via `useState`, which only runs once per
 * mount; without a fresh key each open, reopening the same entity after an
 * unsaved edit (or opening a different one right after) would show stale
 * values instead of resetting.
 */
export function useEntityDialog() {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  return {
    open,
    setOpen,
    entity,
    key,
    openWith: (target: Entity | null) => {
      setKey((count) => count + 1);
      setEntity(target);
      setOpen(true);
    },
  };
}
