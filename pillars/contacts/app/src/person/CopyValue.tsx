import { Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@pops/ui';

/** Copy the exact original value and retain a readable clipboard failure. */
export function CopyValue({ value }: { value: string }) {
  const { t } = useTranslation('contacts');
  const [status, setStatus] = useState<'copied' | 'failed' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        className="min-h-11 min-w-11 text-sm"
        aria-label={t('person.copy')}
        onClick={() => void copy()}
      >
        <Copy className="size-4" aria-hidden />
      </Button>
      {status && (
        <p role={status === 'failed' ? 'alert' : 'status'} className="text-sm">
          {t(`person.${status}`)}
          {status === 'failed' && ' [contacts.clipboard]'}
        </p>
      )}
    </div>
  );
}
