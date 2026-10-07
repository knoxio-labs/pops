import { grants, GUEST_EMAIL, OPERATOR_EMAIL, personLedger } from '@/fixtures/sharing';
import {
  accountActivity,
  historyAsGuestSees,
  type HistoryEvent,
} from '@/fixtures/transaction-history';
import { OperatorAccountPage } from '@/screens/finance/shared/account-sharing';
import { GuestAccountPage } from '@/screens/finance/shared/guest-account';
import { HistoryList, type HistoryOptions } from '@/screens/finance/shared/transaction-history';
import { History, TriangleAlert } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { GrantRole } from '@/fixtures/sharing';
import type { ReactNode } from 'react';

/**
 * Everything that happened in one account, on the Activity tab of its page:
 * entries added, edited, deleted and restored, by whom and when. A deleted
 * entry stays listed and carries Restore for anyone who may edit. Older
 * activity is fetched a page at a time from the foot of the list.
 */
export const meta: ScreenMeta = { title: 'Account activity', order: 28, frame: 'none' };

const older = (
  <Button variant="ghost" size="sm">
    Show older activity
  </Button>
);

const guestEvents = historyAsGuestSees(accountActivity);

function AsGuest({ role, children }: { role: GrantRole; children: ReactNode }) {
  return (
    <GuestAccountPage shared={{ account: personLedger, role }} tab="activity">
      {children}
    </GuestAccountPage>
  );
}

function guestList(role: GrantRole, events: HistoryEvent[] = guestEvents) {
  const options: HistoryOptions = {
    viewerEmail: GUEST_EMAIL,
    canRestore: role === 'edit',
    named: true,
  };
  return function Activity() {
    return (
      <AsGuest role={role}>
        <HistoryList events={events} options={options} footer={older} />
      </AsGuest>
    );
  };
}

/** The entry at the top was just restored: its Restore is gone and the restore is the newest event. */
const afterRestore: HistoryEvent[] = [
  {
    id: 'r1',
    description: 'Parking at the venue',
    action: 'restore',
    byEmail: GUEST_EMAIL,
    at: '2026-10-02T10:44:00',
    amount: 1_800,
    changes: [],
  },
  ...guestEvents.map((event) => ({ ...event, restorable: false })),
];

export const states: ScreenStates = {
  'view-only': guestList('view'),
  restored: guestList('edit', afterRestore),
  operator: () => (
    <div className="p-4 md:p-6">
      <OperatorAccountPage
        account={personLedger}
        sharing={{ grants }}
        tab="activity"
        panel={
          <HistoryList
            events={accountActivity}
            options={{ viewerEmail: OPERATOR_EMAIL, canRestore: true, named: true }}
            footer={older}
          />
        }
      />
    </div>
  ),
  empty: () => (
    <AsGuest role="edit">
      <EmptyState
        className="m-auto"
        icon={History}
        title="No activity yet"
        description="Every entry added, edited or deleted in this account is listed here."
      />
    </AsGuest>
  ),
  loading: () => (
    <AsGuest role="edit">
      <div className="space-y-3" role="status" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </AsGuest>
  ),
  error: () => (
    <AsGuest role="edit">
      <EmptyState
        className="m-auto"
        icon={TriangleAlert}
        title="Could not load the activity"
        description="The account and its transactions are unaffected."
        action={<Button variant="outline">Try again</Button>}
      />
    </AsGuest>
  ),
};

export default guestList('edit');
