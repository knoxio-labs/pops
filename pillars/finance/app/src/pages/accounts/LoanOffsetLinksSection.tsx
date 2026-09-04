import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AccountSelect, Badge, Button, DateInput, Label } from '@pops/ui';

import { useAllAccounts } from '../../components/accounts/hooks/useAllAccounts';
import { unwrap } from '../../finance-api-helpers.js';
import {
  loanLinkOffsetAccount,
  loanListOffsetLinks,
  loanUnlinkOffsetAccount,
} from '../../finance-api/index.js';

type OffsetLink = {
  id: string;
  offsetAccountId: string;
  linkedFrom: string;
  unlinkedAt: string | null;
};

const offsetLinksKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'loan-offset-links'] as const;

function useOffsetLinks(accountId: string) {
  return useQuery({
    queryKey: offsetLinksKey(accountId),
    queryFn: async () => unwrap(await loanListOffsetLinks({ path: { id: accountId } })).data,
  });
}

function useLinkOffsetAccount(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { offsetAccountId: string; linkedFrom: string }) =>
      unwrap(
        await loanLinkOffsetAccount({
          path: { id: accountId },
          body: { offsetAccountId: input.offsetAccountId, linkedFrom: input.linkedFrom },
        })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offsetLinksKey(accountId) }),
  });
}

function useUnlinkOffsetAccount(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) =>
      unwrap(await loanUnlinkOffsetAccount({ path: { id: accountId, linkId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: offsetLinksKey(accountId) }),
  });
}

function offsetAccountName(
  accountId: string,
  accounts: ReturnType<typeof useAllAccounts>['accounts']
) {
  return accounts?.find((a) => a.id === accountId)?.name ?? accountId;
}

function LinkRow({
  link,
  accountName,
  onUnlink,
  unlinking,
}: {
  link: OffsetLink;
  accountName: string;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  const closed = link.unlinkedAt !== null;
  return (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{accountName}</span>
        <span className="text-xs text-muted-foreground">
          {closed ? `${link.linkedFrom} – ${link.unlinkedAt}` : `Linked from ${link.linkedFrom}`}
        </span>
      </div>
      {closed ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Closed
        </Badge>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={unlinking} onClick={onUnlink}>
          Unlink
        </Button>
      )}
    </div>
  );
}

function LinkOffsetAccountForm({
  accountId,
  loanAccountId,
  onDone,
}: {
  accountId: string;
  loanAccountId: string;
  onDone: () => void;
}) {
  const { accounts } = useAllAccounts();
  const [offsetAccountId, setOffsetAccountId] = useState<string | undefined>(undefined);
  const [linkedFrom, setLinkedFrom] = useState('');
  const link = useLinkOffsetAccount(accountId);
  const candidates = (accounts ?? []).filter((a) => a.id !== loanAccountId);
  const canSave = offsetAccountId !== undefined && linkedFrom !== '';

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-1.5">
        <Label htmlFor="offset-account">Offset account</Label>
        <AccountSelect
          aria-label="Offset account"
          accounts={candidates}
          value={offsetAccountId}
          onChange={(id) => setOffsetAccountId(id)}
          placeholder="Select an account to offset this loan"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offset-linked-from">Linked from</Label>
        <DateInput
          id="offset-linked-from"
          value={linkedFrom}
          onChange={(e) => setLinkedFrom(e.currentTarget.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave || link.isPending}
          onClick={() => {
            if (offsetAccountId === undefined) return;
            link.mutate({ offsetAccountId, linkedFrom }, { onSuccess: onDone });
          }}
        >
          Link account
        </Button>
      </div>
      {link.isError && (
        <p className="text-xs text-destructive">
          {link.error instanceof Error ? link.error.message : 'Failed to link the account'}
        </p>
      )}
    </div>
  );
}

/**
 * Offset accounts linked to a `loan`-kind account (POPS-2863) — the piece
 * `LoanFields`/`LoanRateHistorySection` (POPS-2846) deliberately left out.
 * The picker excludes the loan account's own id: a loan cannot be its own
 * offset. That guard also lives server-side (`LoanOffsetLinkSelfLinkError`,
 * a 422) since the picker is not the only caller of `linkOffsetAccount`.
 */
export function LoanOffsetLinksSection({ accountId }: { accountId: string }) {
  const [linking, setLinking] = useState(false);
  const links = useOffsetLinks(accountId);
  const { accounts } = useAllAccounts();
  const unlink = useUnlinkOffsetAccount(accountId);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  return (
    <fieldset className="space-y-2 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Offset accounts</legend>
      <div className="flex items-center justify-between">
        <Label>Linked accounts</Label>
        {!linking && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinking(true)}>
            Link offset account
          </Button>
        )}
      </div>
      {linking && (
        <LinkOffsetAccountForm
          accountId={accountId}
          loanAccountId={accountId}
          onDone={() => setLinking(false)}
        />
      )}
      {links.data?.length === 0 && (
        <p className="text-xs text-muted-foreground">No offset account linked yet.</p>
      )}
      {links.data && links.data.length > 0 && (
        <div className="space-y-1.5">
          {links.data.map((entry) => (
            <LinkRow
              key={entry.id}
              link={entry}
              accountName={offsetAccountName(entry.offsetAccountId, accounts)}
              unlinking={unlink.isPending && unlinkingId === entry.id}
              onUnlink={() => {
                setUnlinkingId(entry.id);
                unlink.mutate(entry.id);
              }}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
