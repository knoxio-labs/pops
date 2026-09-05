import { FileUp, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { AccountMark, ACCOUNT_KIND_META, Badge, Button, cn } from '@pops/ui';

import { toAccountOptions } from '../../components/accounts/toAccountOptions';

import type { Account, Institution } from '../accounts/types';

/**
 * The account dashboard's header: identity on the left, actions on the
 * right. Mirrors the design playground's `DashboardHeader`
 * (`pillars/design/src/kit/account-dashboard-header.tsx`) with two real-app
 * differences: no "Settle up" (no settle-up flow exists yet — POPS-2861) and
 * no inline archive toggle (that stays on the edit dialog; this page's own
 * archived state is the banner above it, not a header action).
 */
export function AccountDetailHeader({
  account,
  institutions,
  onEdit,
  onAddTransaction,
}: {
  account: Account;
  institutions: Institution[];
  onEdit: () => void;
  onAddTransaction: () => void;
}) {
  const [option] = toAccountOptions([account], institutions);
  const institution = institutions.find((candidate) => candidate.id === account.institutionId);
  const isArchived = account.archivedAt !== null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className={cn('flex items-center gap-3', isArchived && 'opacity-70')}>
        {option && <AccountMark account={option} size="md" />}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{account.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {institution?.name ?? 'No institution'}
            </span>
            <Badge variant="secondary">{ACCOUNT_KIND_META[account.kind].label}</Badge>
            <Badge variant="outline">{account.currency}</Badge>
            {isArchived && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/finance/import?account=${account.id}`}>
            <FileUp className="h-4 w-4" />
            Import transactions
          </Link>
        </Button>
        <Button size="sm" onClick={onAddTransaction}>
          <Plus className="h-4 w-4" />
          Add transaction
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit account
        </Button>
      </div>
    </div>
  );
}
