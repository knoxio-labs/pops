import { useEffect } from 'react';

import { documentUploadHost } from './document-upload-authority';

import type { ShellUploadHost } from './document-upload-host';

/** Reverify browser lifecycle boundaries; failures are published by the host to upload controls. A closed app cannot observe external logout synchronously. */
export function DocumentUploadsLifecycle({
  host = documentUploadHost,
}: {
  host?: ShellUploadHost;
}) {
  useEffect(() => {
    const refresh = () => {
      void host.verify().catch(() => undefined);
    };
    const storage = (event: StorageEvent) => host.handleStorageEvent(event);
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', storage);
    };
  }, [host]);
  return null;
}
