import { grants, personLedger } from '@/fixtures/sharing';
import { OperatorAccountPage } from '@/screens/finance/shared/account-sharing';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

/**
 * Revoking asks first. It is the one sharing action that takes something away
 * from another person, and it lands on their next request, not at some later
 * sync. What they already added stays in the account under their email.
 */
export const meta: ScreenMeta = { title: 'Revoke access', order: 20.5, frame: 'web' };

function Confirm({ problem }: { problem?: string }) {
  return (
    <>
      <OperatorAccountPage account={personLedger} sharing={{ grants }} />
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop sharing with marta@ferreira.example?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose this account the next time they open it. Everything they added stays, and
              the history still names them. You can share it with them again at any time.
            </AlertDialogDescription>
            {problem && <p className="text-sm text-destructive">{problem}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sharing</AlertDialogCancel>
            <AlertDialogAction>Revoke access</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const states: ScreenStates = {
  failed: () => <Confirm problem="Could not revoke access. They can still open the account." />,
};

export default function RevokeAccessScreen() {
  return <Confirm />;
}
