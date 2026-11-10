import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { i18n as translations } from '../locales';
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

/** Register owner translations on the host instance before returning a canonical contact; retain session across route remounts. */
export function ContactChooser(props: ContactChooserProps) {
  const { i18n } = useTranslation();
  const registered = useSyncExternalStore(
    (notify) => {
      i18n.store.on('added', notify);
      i18n.store.on('removed', notify);
      return () => {
        i18n.store.off('added', notify);
        i18n.store.off('removed', notify);
      };
    },
    () =>
      Object.keys(translations.resources).every((locale) =>
        i18n.hasResourceBundle(locale, translations.namespace)
      ),
    () => false
  );
  useEffect(() => {
    for (const [locale, resources] of Object.entries(translations.resources)) {
      i18n.addResourceBundle(locale, translations.namespace, resources, true, true);
    }
  }, [i18n]);
  return registered ? <ContactChooserContent {...props} /> : null;
}

function ContactChooserContent({
  open,
  onOpenChange,
  onSelect,
  gateway = contactGateway,
  session,
}: ContactChooserProps) {
  const [creating, setCreating] = useState(Boolean(session?.snapshot().name));
  const creation = useContactCreation(gateway, session);
  const delivery = useRef(0);
  const context = useRef({ open, session, gateway });
  useEffect(() => {
    context.current = { open, session, gateway };
    if (!open) delivery.current += 1;
    return () => {
      delivery.current += 1;
    };
  }, [open, session, gateway]);
  async function submit() {
    const generation = delivery.current;
    const owner = context.current;
    const selection = await creation.submit();
    if (selection && generation === delivery.current && owner === context.current && owner.open) {
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
        selectionIntent={session}
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
