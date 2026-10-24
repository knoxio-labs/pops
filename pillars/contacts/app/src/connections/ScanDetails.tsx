import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { describeContactError } from '../errors';

import type { ConnectionsGateway } from './contracts';

/** Track a real scan; completed batch links use the shared import-review route. */
export function ScanDetails({
  runId,
  gateway,
  previous = false,
}: {
  runId: string;
  gateway: ConnectionsGateway;
  previous?: boolean;
}) {
  const { t } = useTranslation('contacts');
  const query = useQuery({
    queryKey: ['contacts-provider-scan', runId],
    queryFn: () => gateway.scan(runId),
    retry: false,
    refetchInterval: (result) =>
      result.state.data && ['pending', 'running'].includes(result.state.data.status) ? 2000 : false,
  });
  if (query.error) return <p role="alert">{describeContactError(query.error, t)}</p>;
  if (!query.data) return <p role="status">{t('connections.scanLoading')}</p>;
  const scan = query.data;
  const status = ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(scan.status)
    ? scan.status
    : 'unknown';
  return (
    <section
      className="space-y-3"
      aria-label={t(previous ? 'connections.previousPreview' : 'connections.latestScan')}
    >
      <p className="text-base font-semibold">
        {t(previous ? 'connections.previousPreview' : 'connections.latestScan')}
      </p>
      <p role="status">
        {t(`connections.scanStates.${status}`)} ·{' '}
        {t('connections.collections', {
          done: scan.completedCollections,
          total: scan.totalCollections,
        })}
      </p>
      {scan.status === 'completed' &&
        scan.batchIds.map((id, index) => (
          <Button key={id} asChild variant="outline">
            <Link to={`/contacts/imports/${encodeURIComponent(id)}`}>
              {t('connections.reviewPreview', { number: index + 1 })}
            </Link>
          </Button>
        ))}
      {scan.status === 'failed' && (
        <p className="text-sm leading-6">{t('connections.scanFailed')}</p>
      )}
      {scan.status === 'completed' && scan.batchIds.length === 0 && (
        <p>{t('connections.noChanges')}</p>
      )}
    </section>
  );
}
