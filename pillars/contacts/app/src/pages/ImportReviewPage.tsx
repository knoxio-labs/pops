import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { PageHeader } from '@pops/ui';

import { fileImportGateway } from '../imports/api';
import { ImportPreview } from '../imports/ImportPreview';
import { reviewGateway } from '../review/api';
import { ReviewPanel } from '../review/ReviewPanel';

/** Upload an export or review an existing staged batch without a person-editing surface. */
export function ImportReviewPage() {
  const { t } = useTranslation('contacts');
  const { batchId } = useParams<{ batchId: string }>();
  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title={t(batchId ? 'page.reviewTitle' : 'page.uploadTitle')}
        description={t('page.description')}
        backHref={batchId ? '/contacts' : undefined}
        renderLink={Link}
        breadcrumbs={
          batchId
            ? [{ label: t('nav.title'), href: '/contacts' }, { label: t('page.reviewCrumb') }]
            : undefined
        }
      />
      {batchId ? (
        <ReviewPanel key={batchId} batchId={batchId} gateway={reviewGateway} />
      ) : (
        <ImportPreview gateway={fileImportGateway} />
      )}
    </main>
  );
}
