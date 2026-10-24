import { ArrowUpRight, Check, Cloud, ContactRound, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, PageHeader } from '@pops/ui';

import { ConnectionDialog } from './connection-dialog';
import { connectionCopy, type ConnectionState, type ContactProvider } from './connection-model';

import type { ScreenStates } from '@/contract';

interface ProviderCardProps {
  provider: ContactProvider;
  condition: ConnectionState;
  onConnected: () => void;
  onDisconnected: () => void;
  notify: (message: string) => void;
}

function ProviderCard({
  provider,
  condition,
  onConnected,
  onDisconnected,
  notify,
}: ProviderCardProps) {
  const connected = condition === 'connected';
  const Icon = provider === 'Google' ? ContactRound : Cloud;
  return (
    <ConnectionDialog
      provider={provider}
      condition={condition}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
      notify={notify}
    >
      <Button
        variant="ghost"
        aria-label={`${provider}: ${connectionCopy[condition].title}. ${connectionCopy[condition].action}`}
        className={`group h-auto min-h-48 w-full flex-col items-stretch justify-between gap-4 whitespace-normal rounded-xl border-2 bg-card p-5 text-left text-foreground shadow-sm transition-colors hover:border-app-accent hover:bg-accent/40 ${connected ? 'border-solid border-app-accent/60' : 'border-dashed border-border'}`}
      >
        <span className="flex w-full items-start justify-between gap-4">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-5" />
            </span>
            <span className="text-xl font-semibold tracking-tight">{provider}</span>
          </span>
          {connected ? (
            <span className="flex size-6 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
              <Check className="size-4" />
            </span>
          ) : (
            <Plus className="mt-1 size-5 text-foreground/70" />
          )}
        </span>
        <span className="block min-h-14 space-y-1">
          <span className="block text-base leading-7 text-foreground/85">
            {connected ? 'owner@example.test' : connectionCopy[condition].message}
          </span>
          {connected && (
            <span className="block text-sm leading-6 text-foreground/80">
              Last synced today · 6 contacts
            </span>
          )}
        </span>
        <span className="flex w-full items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm font-medium">
          <span>{connectionCopy[condition].title}</span>
          <ArrowUpRight className="size-5 text-foreground/70" />
        </span>
      </Button>
    </ConnectionDialog>
  );
}

/** Clickable provider cards open connection dialogs; fixtures never send requests. */
export function Connections({ condition = 'mixed' }: { condition?: ConnectionState | 'mixed' }) {
  const [message, setMessage] = useState('');
  const [states, setStates] = useState<Record<ContactProvider, ConnectionState>>(() => ({
    Google: condition === 'mixed' ? 'connected' : condition,
    iCloud: condition === 'mixed' ? 'disconnected' : condition,
  }));
  const providers: ContactProvider[] = ['Google', 'iCloud'];
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title="Contact connections"
        description="Connect your accounts, then review the people you bring into POPS."
      />
      {message && (
        <p role="status" className="text-base">
          {message}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            condition={states[provider]}
            onConnected={() => setStates((previous) => ({ ...previous, [provider]: 'connected' }))}
            onDisconnected={() =>
              setStates((previous) => ({ ...previous, [provider]: 'disconnected' }))
            }
            notify={setMessage}
          />
        ))}
      </div>
      <p className="text-base leading-7 text-foreground/85">
        Connections are read only. Review new matches before applying an import.
      </p>
    </div>
  );
}

/** Connection boundaries include fresh setup, outage, expired access and mixed accounts. */
export const connectionStates: ScreenStates = {
  empty: () => <Connections condition="disconnected" />,
  loading: () => <Connections condition="loading" />,
  error: () => <Connections condition="error" />,
  expired: () => <Connections condition="expired" />,
  success: () => <Connections condition="connected" />,
  mixed: () => <Connections />,
};
