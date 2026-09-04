import { Eye, Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { TextInput } from '@pops/ui';

import { unwrap } from '../../finance-api-helpers.js';
import { giftCardDetailsReveal } from '../../finance-api/index.js';
import { RevealedGiftCardValues } from './RevealedGiftCardValues';

interface RevealState {
  status: 'masked' | 'loading' | 'revealed';
  number?: string;
  pin?: string;
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="text-muted-foreground">
      {children}
    </button>
  );
}

/**
 * A saved gift card's number and PIN, masked by default. "Reveal" calls the
 * real `giftCardDetailsReveal` endpoint (POPS-2772) — audited, decrypts once
 * per call — rather than caching or faking a client-side-readable secret,
 * per the ticket's explicit instruction not to invent a fake unmasked read
 * path. `lastFour` (from the masked `get`) is shown until revealed.
 */
export function GiftCardSecretField({
  accountId,
  lastFour,
}: {
  accountId: string;
  lastFour: string;
}) {
  const [state, setState] = useState<RevealState>({ status: 'masked' });

  const reveal = async () => {
    setState({ status: 'loading' });
    const result = unwrap(await giftCardDetailsReveal({ path: { id: accountId } }));
    setState({ status: 'revealed', number: result.data.number, pin: result.data.pin });
  };

  if (state.status === 'revealed') {
    return (
      <RevealedGiftCardValues
        number={state.number ?? ''}
        pin={state.pin ?? ''}
        onHide={() => setState({ status: 'masked' })}
      />
    );
  }
  return (
    <TextInput
      label="Saved card number"
      readOnly
      value={`•••• •••• •••• ${lastFour}`}
      className="font-mono"
      suffix={
        <IconButton label="Reveal card number and PIN" onClick={() => void reveal()}>
          {state.status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </IconButton>
      }
    />
  );
}
