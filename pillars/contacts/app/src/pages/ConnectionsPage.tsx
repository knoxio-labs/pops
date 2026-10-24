import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { connectionsGateway } from '../connections/api';
import { ConnectionsPanel } from '../connections/ConnectionsPanel';
import { ReturnNotice } from '../connections/ReturnNotice';

/** Human-operated provider connections and staged-preview entry points. */
export function ConnectionsPage() {
  const { t } = useTranslation('contacts');
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader title={t('connections.title')} description={t('connections.description')} />
      <ReturnNotice />
      <ConnectionsPanel gateway={connectionsGateway} />
    </main>
  );
}
