import { Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@pops/ui';

/** Copy an explicit contact value only on user action; clipboard denial stays visible. */
export function CopyContact({ value }: { value: string }) {
  const [status, setStatus] = useState('');
  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label="Copy contact value"
        variant="ghost"
        disabled={!value}
        onClick={() => {
          setStatus('');
          if (!navigator.clipboard) {
            setStatus('Copy unavailable');
            return;
          }
          void navigator.clipboard.writeText(value).then(
            () => setStatus('Copied'),
            () => setStatus('Copy failed')
          );
        }}
      >
        <Copy className="size-4" aria-hidden />
      </Button>
      {status && (
        <span role="status" className="text-xs">
          {status}
        </span>
      )}
    </div>
  );
}
