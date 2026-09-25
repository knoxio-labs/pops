/**
 * Settings, Paperless: where Paperless lives, whether a token is stored
 * (never the token itself), what Paperless last answered, and Test
 * connection against the address being edited. While Paperless is down,
 * item documents and report receipts stay listed with their actions off.
 */
import { CircleCheck, CircleDashed, CircleX, LoaderCircle } from 'lucide-react';

import { Button, TextInput, cn } from '@pops/ui';

import { SettingsCard } from './settings-parts';

import type { LucideIcon } from 'lucide-react';

import type { PaperlessStatus, SettingsState } from './settings-model';

function statusLine(status: PaperlessStatus): {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
} {
  switch (status.kind) {
    case 'not-set-up':
      return {
        icon: CircleDashed,
        tone: 'text-muted-foreground',
        title: 'Not set up',
        detail: 'Items can hold documents once Paperless is connected.',
      };
    case 'testing':
      return {
        icon: LoaderCircle,
        tone: 'text-muted-foreground motion-safe:animate-spin',
        title: 'Testing the connection',
        detail: `Asking ${status.url} for its document count.`,
      };
    case 'connected':
      return {
        icon: CircleCheck,
        tone: 'text-success',
        title: `Connected, ${status.documents.toLocaleString('en-AU')} documents`,
        detail: `Checked ${status.checked}.`,
      };
    case 'unreachable':
      return {
        icon: CircleX,
        tone: 'text-warning',
        title: 'Paperless unreachable',
        detail: `${status.reason} Checked ${status.checked}. Documents show as unavailable until it answers.`,
      };
  }
}

/** The Paperless card. */
export function PaperlessSection({
  state,
  locked,
  onUrl,
  onTest,
}: {
  state: SettingsState;
  locked?: string;
  onUrl: (url: string) => void;
  onTest: () => void;
}) {
  const line = statusLine(state.paperless);
  const Icon = line.icon;
  const testing = state.paperless.kind === 'testing';
  return (
    <SettingsCard
      title="Paperless"
      description="Receipts, manuals and warranties live in Paperless; items link to them."
    >
      <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2" role="status">
        <Icon className={cn('mt-0.5 size-4 shrink-0', line.tone)} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{line.title}</p>
          <p className="text-xs text-muted-foreground">{line.detail}</p>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <TextInput
          label="Address"
          value={state.draft.paperlessUrl}
          placeholder="https://paperless.home"
          onChange={(event) => onUrl(event.target.value)}
          containerClassName="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          className="shrink-0"
          disabled={testing || state.draft.paperlessUrl === '' || locked !== undefined}
          onClick={onTest}
        >
          {testing ? 'Testing' : 'Test connection'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {state.draft.paperlessTokenSet
          ? 'An API token is stored on the server. It is never shown here.'
          : 'No API token stored. Add one on the server; this page never shows it.'}
      </p>
    </SettingsCard>
  );
}
