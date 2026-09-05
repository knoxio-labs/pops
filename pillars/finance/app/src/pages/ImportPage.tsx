import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import { useImportPrescope } from '../components/imports/hooks/useImportPrescope';
import { useImportResume } from '../components/imports/hooks/useImportResume';
import { ImportWizard } from '../components/imports/ImportWizard';
import { ResumeImportDialog } from '../components/imports/ResumeImportDialog';

/**
 * Import page — wraps the import wizard behind the persistence hydration gate
 * so a restored run never flashes step 1 before the resume prompt appears.
 * The wizard mounts only once the resume decision is settled: mounting it
 * behind the prompt would let step side-effects (e.g. ProcessingStep's
 * auto-start POST) fire before the user chose Resume or Discard. The same
 * gate is what lets `?account=` (POPS-2875) pre-select an account only into a
 * fresh run.
 */
export function ImportPage() {
  const { t } = useTranslation('finance');
  const { status, resumed, resume, discard } = useImportResume();
  useImportPrescope(status, resumed);

  return (
    <div className="space-y-6">
      <PageHeader title={t('import.title')} description={t('import.description')} />

      {status === 'ready' && <ImportWizard />}
      <ResumeImportDialog open={status === 'prompt'} onResume={resume} onDiscard={discard} />
    </div>
  );
}
