import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { institutionsById } from '@/fixtures/institutions';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Archive, FileUp, HandCoins, Pencil, Plus } from 'lucide-react';

import { Badge, Button, cn } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

/**
 * The account page's header: identity on the left, actions on the right.
 * Archiving lives here rather than behind a menu — it is the one lifecycle
 * action every account offers, toggling label with `account.archived`, and
 * deletion is never one of the actions since transactions reference the
 * account for good.
 */
export function DashboardHeader({ account }: { account: Account }) {
  const where = institutionsById.get(account.institutionId ?? '')?.name ?? 'No institution';
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className={cn('flex items-center gap-3', account.archived && 'opacity-70')}>
        <AccountAvatar account={account} size="md" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{account.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{where}</span>
            <Badge variant="secondary">{ACCOUNT_KINDS[account.kind].label}</Badge>
            <Badge variant="outline">{account.currency}</Badge>
            {account.archived && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a href={`#/imports/new?account=${account.id}`}>
            <FileUp className="h-4 w-4" />
            Import transactions
          </a>
        </Button>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Add transaction
        </Button>
        {account.kind === 'person' && (
          <Button variant="outline" size="sm">
            <HandCoins className="h-4 w-4" />
            Settle up
          </Button>
        )}
        <Button variant="ghost" size="sm">
          <Pencil className="h-4 w-4" />
          Edit account
        </Button>
        <Button variant="ghost" size="sm">
          <Archive className="h-4 w-4" />
          {account.archived ? 'Unarchive account' : 'Archive account'}
        </Button>
      </div>
    </div>
  );
}
