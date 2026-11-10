import { useState } from 'react';

import type { JSX } from 'react';

import type { ContactChooserIntent } from '@pops/pillar-sdk';

import type { PeopleWorkspaceProps } from './types';

const intents = new Map<string, ContactChooserIntent>();

/** Retain opaque owner sessions above route mounts until a canonical selection completes the explicit intent. */
export function PeopleChooser({
  workspace,
  intentKey,
  open,
  onOpenChange,
  onSelect,
}: {
  workspace: PeopleWorkspaceProps;
  intentKey: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSelect: (uri: string) => void;
}): JSX.Element | null {
  const [intent, setIntent] = useState<{ key: string; value: ContactChooserIntent }>();
  if (open && !intent && workspace.contacts) {
    const key = `${workspace.client?.getConfig().baseUrl ?? '/trips-api'}:${workspace.tripId}:${intentKey}`;
    const value = intents.get(key) ?? workspace.contacts.createIntent();
    intents.set(key, value);
    setIntent({ key, value });
  }
  if (!intent) return null;
  const Chooser = intent.value.Chooser;
  return (
    <Chooser
      open={open}
      onOpenChange={onOpenChange}
      onSelect={(selection) => {
        onSelect(selection.reference.uri);
        intents.delete(intent.key);
        setIntent(undefined);
      }}
    />
  );
}
