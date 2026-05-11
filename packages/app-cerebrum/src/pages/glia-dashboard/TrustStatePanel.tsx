/**
 * Trust state panel — shows the current graduation phase per action
 * type with running counts of approvals/rejections/reverts.
 */
import { useTranslation } from 'react-i18next';

import { trpc } from '@pops/api-client';
import {
  Badge,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import type { GliaTrustState } from '../../glia/types';

function TrustRow({ state }: { state: GliaTrustState }) {
  return (
    <TableRow data-testid="glia-trust-row">
      <TableCell className="text-xs">{state.actionType}</TableCell>
      <TableCell>
        <Badge variant="outline">{state.currentPhase}</Badge>
      </TableCell>
      <TableCell className="text-xs">{state.approvedCount}</TableCell>
      <TableCell className="text-xs">{state.rejectedCount}</TableCell>
      <TableCell className="text-xs">{state.revertedCount}</TableCell>
    </TableRow>
  );
}

export function TrustStatePanel() {
  const { t } = useTranslation('cerebrum');
  const query = trpc.cerebrum.glia.trustState.list.useQuery();
  const states: GliaTrustState[] = query.data?.states ?? [];

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('glia.trust.title')}
        </h3>
      </header>
      {query.isLoading ? (
        <Skeleton className="h-24 w-full" data-testid="glia-trust-loading" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('glia.trust.column.type')}</TableHead>
              <TableHead>{t('glia.trust.column.phase')}</TableHead>
              <TableHead>{t('glia.trust.column.approved')}</TableHead>
              <TableHead>{t('glia.trust.column.rejected')}</TableHead>
              <TableHead>{t('glia.trust.column.reverted')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {states.map((state) => (
              <TrustRow key={state.actionType} state={state} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
