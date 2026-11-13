import { createHash } from 'node:crypto';

import type { PaperlessClient } from '../modules/paperless/client.js';

/** Bind an upload to its configured upstream origin/path without persisting a credential. */
export function uploadOwner(client: PaperlessClient | null): string | undefined {
  if (client === null) return undefined;
  try {
    const url = new URL(client.getBaseUrl());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    )
      return undefined;
    return createHash('sha256')
      .update(url.origin + url.pathname.replace(/\/+$/, ''))
      .digest('hex');
  } catch {
    return undefined;
  }
}
