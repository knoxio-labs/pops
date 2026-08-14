import { useTranslation } from 'react-i18next';

import { Button, FileUpload } from '@pops/ui';

import { MAX_RECEIPT_PARTS, RECEIPT_ACCEPT } from './parts.js';
import { PastedTextForm } from './PastedTextForm.js';
import { StagedPartList } from './StagedPartList.js';
import { StagingProblems } from './StagingProblems.js';

import type { ReactElement } from 'react';

import type { ReceiptStaging } from './useReceiptStaging.js';

export interface ReceiptIntakeProps {
  intake: ReceiptStaging;
  disabled: boolean;
  onSubmit: () => void;
}

/** Everything that gathers one receipt, up to the point of sending it. */
export function ReceiptIntake({ intake, disabled, onSubmit }: ReceiptIntakeProps): ReactElement {
  const { t } = useTranslation('purchases');
  const { staging } = intake;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <FileUpload
          multiple
          accept={RECEIPT_ACCEPT}
          disabled={disabled}
          prompt={t('receipts.drop.prompt')}
          // The types are already named in words below, so the drop zone's own
          // hint would repeat them as a raw attribute string.
          acceptHint={null}
          onFilesSelected={intake.addFiles}
          onError={(error) => {
            if (error.type === 'not-accepted') intake.refuse(error.file.name);
          }}
        />
        <p className="text-muted-foreground text-xs">{t('receipts.drop.accepts')}</p>
        <p className="text-muted-foreground text-xs">
          {t('receipts.drop.multiPart', { max: MAX_RECEIPT_PARTS })}
        </p>
      </div>

      <PastedTextForm disabled={disabled} onAdd={intake.addText} />

      <StagingProblems problems={staging.problems} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium">{t('receipts.parts.heading')}</h2>
        <StagedPartList
          parts={staging.parts}
          disabled={disabled}
          onRemove={intake.remove}
          onMove={intake.move}
        />
      </div>

      <div className="flex gap-2">
        <Button disabled={staging.parts.length === 0 || disabled} onClick={onSubmit}>
          {t('receipts.action.submit')}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || (staging.parts.length === 0 && staging.problems.length === 0)}
          onClick={intake.clear}
        >
          {t('receipts.action.clear')}
        </Button>
      </div>
    </div>
  );
}
