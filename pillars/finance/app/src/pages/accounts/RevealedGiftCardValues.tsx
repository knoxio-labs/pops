import { Check, Copy, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { TextInput } from '@pops/ui';

import { IconButton } from './GiftCardSecretField';

/** The plaintext number and PIN once `giftCardDetailsReveal` has returned them, with copy and hide actions. */
export function RevealedGiftCardValues({
  number,
  pin,
  onHide,
}: {
  number: string;
  pin: string;
  onHide: () => void;
}) {
  const [copied, setCopied] = useState<'number' | 'pin' | null>(null);
  const copy = (field: 'number' | 'pin', value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(field);
  };
  return (
    <>
      <TextInput
        label="Card number"
        readOnly
        value={number}
        className="font-mono"
        suffix={
          <span className="flex items-center gap-2">
            <IconButton label="Copy card number" onClick={() => copy('number', number)}>
              {copied === 'number' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Hide card number" onClick={onHide}>
              <EyeOff className="h-4 w-4" />
            </IconButton>
          </span>
        }
      />
      <TextInput
        label="PIN"
        readOnly
        value={pin}
        className="font-mono"
        suffix={
          <IconButton label="Copy PIN" onClick={() => copy('pin', pin)}>
            {copied === 'pin' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </IconButton>
        }
      />
    </>
  );
}
