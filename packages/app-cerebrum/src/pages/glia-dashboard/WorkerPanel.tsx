/**
 * Glia worker run-once panel.
 *
 * Surfaces the four BullMQ-backed curation workers (pruner,
 * consolidator, linker, auditor) with a single run-with-dry-run
 * checkbox each. Mirrors `cerebrum.glia.run{Pruner,Consolidator,Linker,Auditor}`.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { Button, Checkbox } from '@pops/ui';

import type { GliaWorkerKey } from '../../glia/types';

const TOUCH_TARGET_MIN_HEIGHT = 'min-h-[44px]';

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown error';
}

interface WorkerRowProps {
  worker: GliaWorkerKey;
  label: string;
}

function useWorkerMutation(worker: GliaWorkerKey) {
  const utils = trpc.useUtils();
  const onSuccess = () => utils.cerebrum.glia.actions.list.invalidate();
  const onError = (err: unknown) => toast.error(extractMessage(err));
  const pruner = trpc.cerebrum.glia.runPruner.useMutation({ onSuccess, onError });
  const consolidator = trpc.cerebrum.glia.runConsolidator.useMutation({ onSuccess, onError });
  const linker = trpc.cerebrum.glia.runLinker.useMutation({ onSuccess, onError });
  const auditor = trpc.cerebrum.glia.runAuditor.useMutation({ onSuccess, onError });
  switch (worker) {
    case 'pruner':
      return pruner;
    case 'consolidator':
      return consolidator;
    case 'linker':
      return linker;
    case 'auditor':
      return auditor;
  }
}

function WorkerRow({ worker, label }: WorkerRowProps) {
  const { t } = useTranslation('cerebrum');
  const mutation = useWorkerMutation(worker);
  const [dryRun, setDryRun] = useState(true);

  const handleRun = () => {
    mutation.mutate(
      { dryRun },
      {
        onSuccess: () => toast.success(t('glia.workers.success', { worker: label })),
      }
    );
  };

  return (
    <div
      data-testid={`glia-worker-${worker}`}
      className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
    >
      <div className="flex-1">
        <p className="font-medium text-sm">{label}</p>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={dryRun}
          onCheckedChange={(next) => setDryRun(next === true)}
          aria-label={t('glia.workers.dryRun')}
        />
        {t('glia.workers.dryRun')}
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={mutation.isPending}
        className={TOUCH_TARGET_MIN_HEIGHT}
        onClick={handleRun}
      >
        {mutation.isPending ? t('glia.workers.running') : t('glia.workers.run')}
      </Button>
    </div>
  );
}

export function WorkerPanel() {
  const { t } = useTranslation('cerebrum');
  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('glia.workers.title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('glia.workers.description')}</p>
      </header>
      <div className="space-y-2" data-testid="glia-worker-list">
        <WorkerRow worker="pruner" label={t('glia.workers.pruner')} />
        <WorkerRow worker="consolidator" label={t('glia.workers.consolidator')} />
        <WorkerRow worker="linker" label={t('glia.workers.linker')} />
        <WorkerRow worker="auditor" label={t('glia.workers.auditor')} />
      </div>
    </section>
  );
}
