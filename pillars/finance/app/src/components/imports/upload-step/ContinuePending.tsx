import { useTranslation } from 'react-i18next';

import { Separator } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import { PendingImportList } from '../pending/PendingImportList';
import { usePendingImports } from '../pending/usePendingImports';

/**
 * What was started and not finished, ahead of starting another. A section
 * and not a modal because the modal only ever knew about the one draft in
 * this browser; with drafts on the server and a bank feeding some of them,
 * there can be several, and a person picking an account below should see
 * that one of them already has that account's rows waiting. Renders nothing
 * when nothing is pending, divider included.
 */
export function ContinuePending() {
  const { t } = useTranslation('finance');
  const { items: pending } = usePendingImports();
  // The server cannot tell this tab's lease from another's, so the draft the
  // wizard is on would read "open in another tab" and its take-over would
  // navigate to the URL already showing.
  const currentDraftId = useImportStore((state) => state.draftId);
  const items = pending?.filter((item) => item.draft.id !== currentDraftId);
  if (items === undefined || items.length === 0) return null;
  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t('import.pending.continueTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('import.pending.continueHint')}</p>
        </div>
        <PendingImportList items={items} compact />
      </section>
      <div className="flex items-center gap-3 pt-2">
        <Separator className="flex-1" />
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('import.pending.orStartNew')}
        </span>
        <Separator className="flex-1" />
      </div>
    </>
  );
}
