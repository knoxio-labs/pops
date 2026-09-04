import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type UseFormReturn } from 'react-hook-form';

import { TextInput } from '@pops/ui';

import { unwrap } from '../../finance-api-helpers.js';
import { giftCardDetailsGet } from '../../finance-api/index.js';
import { GiftCardSecretField } from './GiftCardSecretField';

import type { AccountFormValues } from './types';

function useExistingGiftCardDetails(accountId: string | undefined) {
  return useQuery({
    queryKey: ['finance', 'accounts', accountId, 'gift-card-details'],
    queryFn: async () => unwrap(await giftCardDetailsGet({ path: { id: accountId ?? '' } })).data,
    enabled: accountId !== undefined,
  });
}

/**
 * Expiry and the encrypted number/PIN for a `gift-card` account, backed by
 * the real `gift-card-details` sub-resource (POPS-2772) rather than the
 * design's fixture-only section — `useAccountsPage`'s submit sequence writes
 * this via `giftCardDetailsWrite` once the account itself has an id.
 *
 * On create, `giftCardNumber`/`giftCardPin` are required (enforced in
 * `useAccountsPage`'s submit handler, not this schema, since every other
 * kind has no such requirement). On edit, they start blank: leaving them
 * blank keeps the saved secret, since a PUT only fires when both are filled.
 */
export function GiftCardFields({
  form,
  accountId,
}: {
  form: UseFormReturn<AccountFormValues>;
  accountId?: string;
}) {
  const existing = useExistingGiftCardDetails(accountId);

  useEffect(() => {
    if (existing.data && !form.formState.dirtyFields.giftCardExpiresOn) {
      form.setValue('giftCardExpiresOn', existing.data.expiresOn ?? '');
    }
  }, [existing.data, form]);

  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Gift card</legend>
      <TextInput label="Expires" type="date" {...form.register('giftCardExpiresOn')} />
      {existing.data && (
        <GiftCardSecretField accountId={accountId ?? ''} lastFour={existing.data.lastFour} />
      )}
      <TextInput
        label={
          existing.data ? 'New card number (leave blank to keep the current one)' : 'Card number'
        }
        {...form.register('giftCardNumber')}
        error={form.formState.errors.giftCardNumber?.message}
      />
      <TextInput
        label={existing.data ? 'New PIN (leave blank to keep the current one)' : 'PIN'}
        {...form.register('giftCardPin')}
        error={form.formState.errors.giftCardPin?.message}
      />
    </fieldset>
  );
}
