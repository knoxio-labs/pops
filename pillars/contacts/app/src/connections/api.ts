import {
  providersAccountsDisconnect,
  providersAccountsList,
  providersGoogleAuthorize,
  providersIcloudConnect,
  providersSyncGet,
  providersSyncStart,
  sourcesAccountsList,
} from '../contacts-api/sdk.gen';
import { ContactError } from '../errors';
import { contactRequest } from '../request';
import { StaleReviewError } from '../review/contracts';

import type { ConnectionsGateway } from './contracts';

async function providerRequest<T>(
  request: () => Promise<{ data?: T; response?: Response }>
): Promise<T> {
  try {
    return await contactRequest(request);
  } catch (error) {
    if (error instanceof StaleReviewError)
      throw new ContactError('providerChanged', error.diagnostic);
    throw error;
  }
}

async function noContent(request: () => Promise<{ response?: Response }>): Promise<void> {
  await providerRequest(async () => {
    const result = await request();
    return { response: result.response, data: result.response?.ok ? true : undefined };
  });
}

function googleTarget(location: string): string {
  let target: URL;
  try {
    target = new URL(location);
  } catch {
    throw new ContactError('invalidResponse', 'contacts.providers.authorization_location');
  }
  if (target.origin !== 'https://accounts.google.com' || target.username || target.password)
    throw new ContactError('invalidResponse', 'contacts.providers.authorization_location');
  return target.href;
}

/** Real human-authorized provider calls; authorization URLs are returned for explicit browser navigation. */
export const connectionsGateway: ConnectionsGateway = {
  list: async () => {
    const [statuses, sources] = await Promise.all([
      providerRequest(() => providersAccountsList()),
      providerRequest(() => sourcesAccountsList()),
    ]);
    return statuses.flatMap((account) => {
      if (account.provider !== 'google' && account.provider !== 'icloud') return [];
      return [
        {
          ...account,
          provider: account.provider,
          latestRunId: account.latestRunId ?? null,
          previewRunId: account.previewRunId ?? null,
          label: sources.data.find((source) => source.id === account.accountId)?.label ?? undefined,
        },
      ];
    });
  },
  authorize: async (accountId, includeOtherContacts) => {
    const location = await providerRequest(async () => {
      const result = await providersGoogleAuthorize({
        body: { accountId, includeOtherContacts },
        redirect: 'error',
      });
      return {
        response: result.response,
        data:
          result.response?.status === 201
            ? (result.response.headers.get('location') ?? undefined)
            : undefined,
      };
    });
    return googleTarget(location);
  },
  connectIcloud: async (credentials) => {
    await providerRequest(() => providersIcloudConnect({ body: credentials }));
  },
  disconnect: (accountId) =>
    noContent(() => providersAccountsDisconnect({ path: { id: accountId } })),
  start: async (accountId) => {
    const operation = await providerRequest(() => providersSyncStart({ path: { id: accountId } }));
    if (!operation.runId)
      throw new ContactError('invalidResponse', 'contacts.providers.missing_run');
    return operation.runId;
  },
  scan: (runId) => providerRequest(() => providersSyncGet({ path: { id: runId } })),
};
