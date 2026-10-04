import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

import { unwrap } from '../purchases-api-helpers.js';
import { reconcileDeactivateRule } from '../purchases-api/index.js';
import { MERCHANT_ORDERS_QUERY_KEY } from './merchant-lens/useMerchantOrders.js';
import { RECONCILE_QUEUE_QUERY_KEY } from './reconcile/useReconcileQueue.js';

import type { ReactElement } from 'react';

interface Props {
  id: string;
  pattern: string;
  source: string | null;
  isActive: boolean;
}

/** Shows the learned rule behind a link and lets an operator deactivate it. */
export function MatchRuleAttribution({ id, pattern, source, isActive }: Props): ReactElement {
  const { t } = useTranslation('purchases');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    meta: { errorHandled: true },
    mutationFn: async () => unwrap(await reconcileDeactivateRule({ path: { ruleId: id } })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RECONCILE_QUEUE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: MERCHANT_ORDERS_QUERY_KEY }),
      ]);
    },
  });
  const inactive = !isActive || mutation.isSuccess;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span>
        <span className="font-medium">{t('reconcile.rule.patternLabel')}:</span> {pattern}
      </span>
      <span className="text-muted-foreground">
        {source === null
          ? t('reconcile.rule.scope.all')
          : t('reconcile.rule.scope.source', { source })}
      </span>
      {inactive ? (
        <span className="text-muted-foreground">{t('reconcile.rule.inactive')}</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t('reconcile.rule.deactivate', { pattern })}
        </Button>
      )}
      {mutation.isError && (
        <span role="alert" className="text-destructive">
          {t('reconcile.rule.deactivationFailed', {
            message: mutation.error instanceof Error ? mutation.error.message : '',
          })}
        </span>
      )}
    </div>
  );
}
