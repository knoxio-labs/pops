import { useEffect, useRef, useState } from 'react';

import { contactGateway } from './api';
import { ContactCreationDialog } from './ContactCreationDialog';
import { ContactPicker } from './ContactPicker';
import { useContactCreation } from './useContactCreation';

import type { ContactCreationGateway, ContactSelection } from './api';
import type { ContactChooserSession } from './ContactChooserSession';

/** Contacts-owned chooser with progressive creation; keep mounted to retain drafts across close/reopen. */
export interface ContactChooserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entity: ContactSelection['entity'], reference: ContactSelection['reference']) => void;
  gateway?: ContactCreationGateway;
  /** Retain outside route views for one intent so ambiguous outcomes cannot become another create after remount. */
  session?: ContactChooserSession;
}

/** Return a real canonical entity/reference without navigating the host or replaying an uncertain create. */
export function ContactChooser({
  open,
  onOpenChange,
  onSelect,
  gateway = contactGateway,
  session,
}: ContactChooserProps) {
  const [creating, setCreating] = useState(Boolean(session?.snapshot().name));
  const creation = useContactCreation(gateway, session);
  const delivery = useRef(0);
  useEffect(() => {
    if (!open) delivery.current += 1;
    return () => {
      delivery.current += 1;
    };
  }, [open]);
  async function submit() {
    const generation = delivery.current;
    const selection = await creation.submit();
    if (selection && generation === delivery.current) {
      onSelect(selection.entity, selection.reference);
      onOpenChange(false);
    }
  }
  function changeOpen(next: boolean) {
    if (!next) delivery.current += 1;
    onOpenChange(next);
  }
  if (!creating)
    return (
      <ContactPicker
        open={open}
        onOpenChange={changeOpen}
        onSelect={onSelect}
        gateway={gateway}
        initialSearch={creation.name}
        onCreate={(name) => {
          creation.start(name);
          setCreating(true);
        }}
      />
    );
  return (
    <ContactCreationDialog
      open={open}
      onOpenChange={changeOpen}
      creation={creation}
      submit={() => void submit()}
      existing={() => {
        delivery.current += 1;
        setCreating(false);
      }}
    />
  );
}
