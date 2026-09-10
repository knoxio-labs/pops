import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { useImportStore } from '../../../store/importStore';
import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';

/**
 * Pre-select the account named by `?account=<id>` on the import URL
 * (POPS-2875), the way the account page's "Import transactions" link arrives.
 *
 * It fires once, and only into a wizard that is fresh: `fresh` is the page's
 * word that no draft was asked for and the wizard is mounted. Never over an
 * account the store already holds (same-session navigation keeps the live
 * wizard as it was). An id the accounts list does not know is ignored rather
 * than stored — the picker would show nothing for it.
 */
export function useImportPrescope(fresh: boolean): void {
  const [params] = useSearchParams();
  const requested = params.get('account');
  const { accounts } = useAllAccounts();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !fresh || !requested || !accounts) return;
    applied.current = true;
    const store = useImportStore.getState();
    if (store.accountId !== null) return;
    const account = accounts.find((candidate) => candidate.id === requested);
    if (account) store.setAccount(account.id, account.name);
  }, [fresh, requested, accounts]);
}
