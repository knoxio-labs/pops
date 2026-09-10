import { Button, FileUpload } from '@pops/ui';

import { MAX_RECEIPT_PARTS, RECEIPT_ACCEPT } from './parts';
import { PastedTextForm } from './pasted-text-form';
import { StagedPartList } from './staged-part-list';
import { StagingProblems } from './staging-problems';

import type { ReceiptStaging } from './use-receipt-staging';

export interface ReceiptIntakeProps {
  intake: ReceiptStaging;
  disabled: boolean;
  onSubmit: () => void;
}

/** Everything that gathers one receipt, up to the point of sending it. */
export function ReceiptIntake({ intake, disabled, onSubmit }: ReceiptIntakeProps) {
  const { staging } = intake;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <FileUpload
          multiple
          accept={RECEIPT_ACCEPT}
          disabled={disabled}
          prompt="Drop a receipt here, or choose a file"
          acceptHint={null}
          onFilesSelected={intake.addFiles}
          onError={(error) => {
            if (error.type === 'not-accepted') intake.refuse(error.file.name);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Accepted: JPEG, PNG, WebP, GIF, PDF, or plain text.
        </p>
        <p className="text-muted-foreground text-xs">
          A long receipt can be photographed in several frames. Add up to {MAX_RECEIPT_PARTS} of
          them: they are one purchase, read in the order below.
        </p>
      </div>

      <PastedTextForm disabled={disabled} onAdd={intake.addText} />

      <StagingProblems problems={staging.problems} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium">This receipt, in order</h2>
        <StagedPartList
          parts={staging.parts}
          disabled={disabled}
          onRemove={intake.remove}
          onMove={intake.move}
        />
      </div>

      <div className="flex gap-2">
        <Button disabled={staging.parts.length === 0 || disabled} onClick={onSubmit}>
          Read this receipt
        </Button>
        <Button
          variant="outline"
          disabled={disabled || (staging.parts.length === 0 && staging.problems.length === 0)}
          onClick={intake.clear}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}
