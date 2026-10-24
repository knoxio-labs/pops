import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Badge, Button, Card, CardContent } from '@pops/ui';

import { ContactError, describeContactError } from '../errors';
import { UploadForm } from './UploadForm';

import type { ReviewSnapshot } from '../review/contracts';
import type { FileImportGateway, FileImportInput } from './contracts';

/** Stage a selected export and present real parser results before identity review. */
export function ImportPreview({ gateway }: { gateway: FileImportGateway }) {
  const { t } = useTranslation('contacts');
  const [preview, setPreview] = useState<ReviewSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function stage(input: FileImportInput) {
    setPending(true);
    setPreview(null);
    setError(null);
    try {
      setPreview(await gateway.stage(input));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure
          : new ContactError('stageFailed', 'contacts.import.stage_failed')
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <UploadForm disabled={pending} onStage={(input) => void stage(input)} />
      {pending && <p role="status">{t('preview.loading')}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {describeContactError(error, t)} {t('preview.failureSuffix')}
        </p>
      )}
      {preview && <PreviewRecords preview={preview} />}
    </div>
  );
}

function PreviewRecords({ preview }: { preview: ReviewSnapshot }) {
  const { t } = useTranslation('contacts');
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h2 className="text-lg font-semibold">{t('preview.title')}</h2>
        <PreviewSummary preview={preview} />
        {preview.items.length === 0 ? (
          <p role="status">{t('preview.empty')}</p>
        ) : (
          <>
            <p role="status">{t('preview.ready')}</p>
            <ul className="divide-y divide-border">
              {preview.items.slice(0, 50).map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span className="text-base font-semibold">
                    {item.name || t('unnamedContact')}
                  </span>
                  <span className="text-sm text-foreground/85">
                    {item.errors.length
                      ? item.errors
                          .map((issue) => t(`rowIssues.${issue}`, { defaultValue: issue }))
                          .join(', ')
                      : [
                          t(item.status, { defaultValue: item.status }),
                          item.reason && t(`reasons.${item.reason}`, { defaultValue: item.reason }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            <Button asChild>
              <Link to={`/contacts/imports/${encodeURIComponent(preview.batchId)}`}>
                {t('preview.reviewIdentities')}
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewSummary({ preview }: { preview: ReviewSnapshot }) {
  const { t } = useTranslation('contacts');
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{t('preview.records', { count: preview.totalRows })}</Badge>
      <Badge variant="outline">{t('preview.invalid', { count: preview.counts.invalid })}</Badge>
      <Badge variant="outline">{t('preview.automatic', { count: preview.counts.automatic })}</Badge>
      <Badge variant="outline">{t('preview.review', { count: preview.counts.review })}</Badge>
      <Badge variant="outline">{t('preview.new', { count: preview.counts.new })}</Badge>
    </div>
  );
}
