import { Button } from '@pops/ui';

import type { JSX } from 'react';

import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSource } from './types';

/** Remove only the exact active collection membership, through the owning retained operation history. */
export function CaptureMembershipRemove({
  membership,
  session,
  busy,
}: {
  membership: Pick<CaptureSource['memberships'][number], 'id' | 'revision'>;
  session: CaptureBrowserSession;
  busy: boolean;
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={() =>
        void session.editor.commit(
          {
            kind: 'explore.remove',
            id: membership.id,
            expectedRevision: membership.revision,
          },
          'Remove from Explore'
        )
      }
    >
      Remove from Explore
    </Button>
  );
}
