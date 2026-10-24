import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@pops/ui';

import { fileImportGateway } from '../imports/api';
import { ImportPreview } from '../imports/ImportPreview';
import { reviewGateway } from '../review/api';
import { ReviewPanel } from '../review/ReviewPanel';

import type { ReactNode } from 'react';

/** Upload an export or review an existing staged batch without a person-editing surface. */
export function ImportReviewPage() {
  const { t } = useTranslation('contacts');
  const { batchId } = useParams<{ batchId: string }>();
  return (
    <main className="space-y-6 p-6">
      {!batchId && <PageHeader title={t('page.uploadTitle')} description={t('page.description')} />}
      {batchId ? (
        <ReviewPanel
          key={batchId}
          batchId={batchId}
          gateway={reviewGateway}
          renderHeader={(actions) => <ReviewHeader actions={actions} />}
        />
      ) : (
        <ImportPreview gateway={fileImportGateway} />
      )}
    </main>
  );
}

function ReviewHeader({ actions }: { actions: ReactNode }) {
  const { t } = useTranslation('contacts');
  return (
    <PageHeader
      title={t('page.reviewTitle')}
      description={t('page.description')}
      backHref="/contacts"
      renderLink={Link}
      breadcrumbs={[{ label: t('nav.title'), href: '/contacts' }, { label: t('page.reviewCrumb') }]}
      actions={actions}
    />
  );
}
