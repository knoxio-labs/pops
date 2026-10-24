import { ArrowUpRight, Check, Cloud, ContactRound, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import type { ContactConnection, ContactProvider } from './contracts';

/** The complete provider card opens setup or management, including keyboard activation. */
export function ProviderCard({
  provider,
  account,
  onOpen,
}: {
  provider: ContactProvider;
  account?: ContactConnection;
  onOpen: () => void;
}) {
  const { t } = useTranslation('contacts');
  const connected = account?.connected === true && !account.reauthorizationRequired;
  const Icon = provider === 'google' ? ContactRound : Cloud;
  const state = connectionState(account);
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      aria-label={t('connections.open', {
        provider: t(`connections.providers.${provider}`),
        state: t(`connections.states.${state}`),
      })}
      className={`h-auto min-h-48 w-full min-w-0 flex-col items-stretch justify-between gap-4 whitespace-normal rounded-xl border-2 bg-card p-5 text-left text-foreground shadow-sm hover:border-app-accent hover:bg-accent/40 ${connected ? 'border-solid border-app-accent/60' : 'border-dashed border-border'}`}
    >
      <span className="flex w-full items-start justify-between gap-4">
        <span className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            {t(`connections.providers.${provider}`)}
          </span>
        </span>
        {connected ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground">
            <Check className="size-4" />
          </span>
        ) : (
          <Plus className="mt-1 size-5 text-foreground/70" />
        )}
      </span>
      <span className="block min-h-14 break-words text-base leading-7 text-foreground/85">
        {account?.label ?? t(`connections.messages.${state}`)}
      </span>
      <span className="flex w-full items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm font-medium">
        <span>{t(`connections.states.${state}`)}</span>
        <ArrowUpRight className="size-5 text-foreground/70" />
      </span>
    </Button>
  );
}

function connectionState(account?: ContactConnection) {
  if (account?.reauthorizationRequired) return 'expired';
  return account?.connected ? 'connected' : 'disconnected';
}
