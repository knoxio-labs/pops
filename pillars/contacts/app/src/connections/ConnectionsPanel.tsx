import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Skeleton } from '@pops/ui';

import { describeContactError } from '../errors';
import { ConnectionDialog } from './ConnectionDialog';
import { ProviderCard } from './ProviderCard';

import type { ContactConnection, ContactProvider, ConnectionsGateway } from './contracts';

interface SelectedConnection {
  provider: ContactProvider;
  account?: ContactConnection;
}

/** Load actual connection states; an unavailable provider service never pretends to be disconnected. */
export function ConnectionsPanel({
  gateway,
  navigate = navigateBrowser,
}: {
  gateway: ConnectionsGateway;
  navigate?: (url: string) => void;
}) {
  const { t } = useTranslation('contacts');
  const [selected, setSelected] = useState<SelectedConnection | null>(null);
  const query = useQuery({
    queryKey: ['contacts-connections'],
    queryFn: gateway.list,
    retry: false,
    staleTime: 0,
  });
  return (
    <div className="space-y-6">
      {query.isPending && (
        <Skeleton className="h-48 w-full" aria-label={t('connections.loading')} />
      )}
      {query.error && (
        <div role="alert" className="space-y-3">
          <p>{describeContactError(query.error, t)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('connections.reload')}
          </Button>
        </div>
      )}
      {query.data && !query.error && <ProviderGrid accounts={query.data} onOpen={setSelected} />}
      <p className="text-base leading-7 text-foreground/85">{t('connections.readOnly')}</p>
      {selected && (
        <ConnectionDialog
          {...selected}
          gateway={gateway}
          navigate={navigate}
          refresh={query.refetch}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function navigateBrowser(url: string) {
  window.location.assign(url);
}
function ProviderGrid({
  accounts,
  onOpen,
}: {
  accounts: ContactConnection[];
  onOpen: (selection: SelectedConnection) => void;
}) {
  const providers: ContactProvider[] = ['google', 'icloud'];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {providers.flatMap((provider) => {
        const matches = accounts.filter((account) => account.provider === provider);
        return matches.length ? (
          matches.map((account) => (
            <ProviderCard
              key={account.accountId}
              provider={provider}
              account={account}
              onOpen={() => onOpen({ provider, account })}
            />
          ))
        ) : (
          <ProviderCard key={provider} provider={provider} onOpen={() => onOpen({ provider })} />
        );
      })}
    </div>
  );
}
