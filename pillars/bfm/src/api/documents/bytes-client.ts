import { buildRawDiscovery, resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import type { RawDiscovery } from '@pops/pillar-sdk/server';

/** Unbuffered original-file reads; source metadata never proves bytes exist locally. */
export interface MobileDocumentsBytesClient {
  file(id: number, range: string | undefined): Promise<Response | null>;
}
/** Discovery, transport and credential seams for owner-level file access. */
export interface MobileDocumentsBytesDeps {
  discovery?: RawDiscovery;
  fetchImpl?: typeof fetch;
  apiKey?: () => string | undefined;
}
/** Calls the sanctioned Documents raw download route with the service account and optional Range. */
export function createMobileDocumentsBytesClient(
  deps: MobileDocumentsBytesDeps = {}
): MobileDocumentsBytesClient {
  const discovery = deps.discovery ?? buildRawDiscovery();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? resolveApiKey;
  return {
    file: async (id, range) => {
      const target = await discovery.lookup('documents');
      const key = apiKey();
      if (target === undefined || key === undefined) return null;
      try {
        return await fetchImpl(
          `${target.baseUrl.replace(/\/$/u, '')}/paperless/documents/${id}/download`,
          {
            method: 'GET',
            redirect: 'error',
            headers: {
              [SERVICE_ACCOUNT_HEADER]: key,
              ...(range === undefined ? {} : { range }),
            },
          }
        );
      } catch {
        return null;
      }
    },
  };
}
