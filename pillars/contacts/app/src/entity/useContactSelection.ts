import { useEffect, useRef, useState } from 'react';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactGateway, ContactReference } from './api';

/** Fence asynchronous existing-contact resolution to the active open/search intent while retaining its ID for explicit retry. */
export function useContactSelection({
  open,
  gateway,
  onSelect,
  onOpenChange,
  intent,
}: {
  open: boolean;
  gateway: ContactGateway;
  onSelect: (entity: Entity, reference: ContactReference) => void;
  onOpenChange: (open: boolean) => void;
  intent?: object;
}) {
  const generation = useRef(0);
  const context = useRef({ open, gateway, intent });
  const pending = useRef(0);
  const [selecting, setSelecting] = useState(false);
  const [failedSelection, setFailedSelection] = useState<Entity | null>(null);
  useEffect(() => {
    context.current = { open, gateway, intent };
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, [open, gateway, intent]);
  function invalidate() {
    generation.current += 1;
    setSelecting(false);
  }
  async function select(entity: Entity) {
    const token = ++generation.current;
    const owner = context.current;
    pending.current = token;
    setSelecting(true);
    setFailedSelection(entity);
    try {
      const selection = await gateway.resolve(entity.id);
      if (token !== generation.current || owner !== context.current || !owner.open) return;
      onSelect(selection.entity, selection.reference);
      onOpenChange(false);
      setFailedSelection(null);
    } catch {
      if (token === generation.current) setFailedSelection(entity);
    } finally {
      if (pending.current === token) setSelecting(false);
    }
  }
  function changeOpen(next: boolean) {
    if (!next) invalidate();
    onOpenChange(next);
  }
  function clear() {
    invalidate();
    setFailedSelection(null);
  }
  return { selecting, failedSelection, select, changeOpen, clear };
}
