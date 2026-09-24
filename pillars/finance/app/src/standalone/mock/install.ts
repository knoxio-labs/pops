import { installApiMock, type InstallApiMockOptions } from '@pops/pillar-sdk/testing/api-mock';

import { contactsHandlers, contactsUnavailableHandlers } from './contacts-handlers';
import { financeHandlers } from './finance-handlers';
import { purchasesHandlers } from './purchases-handlers';

/** Whether the contacts contract answers from fixtures or as a pillar that is down. */
export type ContactsMode = 'present' | 'absent';

/** How the finance standalone mocks are installed. */
export interface FinanceMockOptions {
  readonly contacts: ContactsMode;
  readonly target?: InstallApiMockOptions['target'];
  readonly onUnhandled?: InstallApiMockOptions['onUnhandled'];
}

/**
 * Answer the three contracts the finance app talks to — its own, and the
 * vendored contacts and purchases ones — each under the proxy path its
 * generated client is pinned to.
 *
 * With `contacts: 'absent'` every contacts operation answers the registry's
 * `pillar-unavailable` under a 503, so the app's own degrade path is what
 * renders; finance and purchases keep answering.
 *
 * @returns A function restoring `fetch` to what it was before.
 */
export function installFinanceMocks(options: FinanceMockOptions): () => void {
  const { target, onUnhandled } = options;
  const restores = [
    installApiMock({ handlers: financeHandlers, baseUrl: '/finance-api', target, onUnhandled }),
    installApiMock({
      handlers: options.contacts === 'absent' ? contactsUnavailableHandlers : contactsHandlers,
      baseUrl: '/contacts-api',
      target,
      onUnhandled,
    }),
    installApiMock({ handlers: purchasesHandlers, baseUrl: '/purchases-api', target, onUnhandled }),
  ];
  return () => {
    for (const restore of restores.toReversed()) restore();
  };
}
