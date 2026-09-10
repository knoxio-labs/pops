import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle, Button, PageHeader } from '@pops/ui';

import { useDraftHydration } from '../components/imports/hooks/useDraftHydration';
import { useDraftWriteThrough } from '../components/imports/hooks/useDraftWriteThrough';
import { useImportPrescope } from '../components/imports/hooks/useImportPrescope';
import { ImportWizard } from '../components/imports/ImportWizard';
import { useImportStore } from '../store/importStore';

/**
 * Import page. The draft in `?draft=<id>` is the run (finance ADR-005): the
 * page hydrates the wizard from it, claims it, and mirrors every change back
 * to it. With no draft the wizard starts fresh and the first parsed rows
 * create one, which the page then puts in the URL. The wizard mounts only
 * once the draft is settled, so no step side-effect (Process's auto-start
 * POST) fires against state that is about to be replaced.
 */
export function ImportPage() {
  const { t } = useTranslation('finance');
  const [params, setParams] = useSearchParams();
  const requested = params.get('draft');
  const { gate, takeOver, discard } = useDraftHydration(requested);
  const draftId = useImportStore((state) => state.draftId);
  const ready = gate.status === 'ready';

  useEffect(() => {
    if (gate.status === 'gone') {
      toast.info(t('import.draft.gone'));
      setParams({}, { replace: true });
      return;
    }
    if (ready && draftId !== null && requested !== draftId) {
      setParams({ draft: draftId }, { replace: true });
    }
  }, [gate.status, ready, draftId, requested, setParams, t]);

  useDraftWriteThrough(ready);
  useImportPrescope(ready && requested === null);

  return (
    <div className="space-y-6">
      <PageHeader title={t('import.title')} description={t('import.description')} />

      {gate.status === 'unusable' && (
        <Alert variant="destructive">
          <AlertTitle>{t('import.draft.unusableTitle')}</AlertTitle>
          <AlertDescription>
            <p>{gate.reason}</p>
            <Button size="sm" variant="destructive" onClick={() => void discard()}>
              {t('import.draft.discard')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {gate.status === 'owned-elsewhere' && (
        <Alert>
          <AlertTitle>{t('import.draft.ownedElsewhereTitle')}</AlertTitle>
          <AlertDescription>
            <p>{t('import.draft.ownedElsewhereBody')}</p>
            <Button size="sm" onClick={takeOver}>
              {t('import.draft.takeOver')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {ready && <ImportWizard />}
    </div>
  );
}
