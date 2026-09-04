import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { type LoanOffsetLinkEntry, loanOffsetLinksByAccountId } from '@/fixtures/loan-offset-links';
import { AccountSelect } from '@/kit/account-select';
import { useState } from 'react';

import { Badge, Button, Label } from '@pops/ui';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const byId = (id: string) => allAccounts.find((a) => a.id === id);

function LinkRow({ link, onUnlink }: { link: LoanOffsetLinkEntry; onUnlink: () => void }) {
  const offset = byId(link.offsetAccountId);
  const closed = link.unlinkedAt !== null;
  return (
    <div
      className="flex items-center justify-between rounded-md border p-3 text-sm"
      data-closed={closed}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{offset?.name ?? link.offsetAccountId}</span>
        <span className="text-xs text-muted-foreground">
          {closed
            ? `${day(link.linkedFrom)} – ${day(link.unlinkedAt as string)}`
            : `Linked from ${day(link.linkedFrom)}`}
        </span>
      </div>
      {closed ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Closed
        </Badge>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onUnlink}>
          Unlink
        </Button>
      )}
    </div>
  );
}

function LinkOffsetAccountForm({
  candidates,
  onCancel,
  onLink,
}: {
  candidates: Account[];
  onCancel: () => void;
  onLink: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-1.5">
        <Label>Offset account</Label>
        <AccountSelect
          accounts={candidates}
          placeholder="Select an account to offset this loan"
          ariaLabel="Offset account"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onLink}>
          Link account
        </Button>
      </div>
    </div>
  );
}

/**
 * Offset-link management for a `loan`-kind account (POPS-2863) — the piece
 * `LoanTermsSection` deliberately left out of POPS-2846. The picker excludes
 * the loan account itself: a loan cannot be its own offset, enforced again
 * server-side since any other caller of `linkOffsetAccount` could otherwise
 * bypass a client-only guard.
 */
export function LoanOffsetLinksSection({ account }: { account?: Account }) {
  const [linking, setLinking] = useState(false);
  const links = loanOffsetLinksByAccountId[account?.id ?? ''] ?? [];
  const candidates = allAccounts.filter((a) => a.id !== account?.id && !a.archived);

  return (
    <fieldset className="space-y-2 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Offset accounts</legend>
      <div className="flex items-center justify-between">
        <Label>Linked accounts</Label>
        {!linking && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!account}
            onClick={() => setLinking(true)}
          >
            Link offset account
          </Button>
        )}
      </div>
      {linking && (
        <LinkOffsetAccountForm
          candidates={candidates}
          onCancel={() => setLinking(false)}
          onLink={() => setLinking(false)}
        />
      )}
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">No offset account linked yet.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => (
            <LinkRow key={link.id} link={link} onUnlink={() => {}} />
          ))}
        </div>
      )}
    </fieldset>
  );
}
