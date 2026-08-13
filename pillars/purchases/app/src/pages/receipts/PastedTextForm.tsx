import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Textarea } from '@pops/ui';

import type { ReactElement } from 'react';

export interface PastedTextFormProps {
  disabled: boolean;
  onAdd: (text: string) => void;
}

/**
 * The third shape a receipt arrives in: the body of an order confirmation,
 * pasted. It becomes a `text/plain` part like any other, so it can be one
 * frame of a receipt whose other frames are photographs.
 */
export function PastedTextForm({ disabled, onAdd }: PastedTextFormProps): ReactElement {
  const { t } = useTranslation('purchases');
  const [text, setText] = useState('');
  const [complained, setComplained] = useState(false);
  const fieldId = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {t('receipts.text.label')}
      </label>
      <Textarea
        id={fieldId}
        rows={5}
        value={text}
        disabled={disabled}
        placeholder={t('receipts.text.placeholder')}
        onChange={(event) => {
          setText(event.target.value);
          setComplained(false);
        }}
      />
      {complained && (
        <p role="alert" className="text-destructive text-xs">
          {t('receipts.text.empty')}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          if (text.trim() === '') {
            setComplained(true);
            return;
          }
          onAdd(text);
          setText('');
        }}
      >
        {t('receipts.text.add')}
      </Button>
    </div>
  );
}
