import { CaptureWorkspace } from '@pops/trips-workspace';

import type { CaptureWorkspaceProps } from '@pops/trips-workspace';

/** Owning-trip contextual tools; the host controls the view, transports and source-event opening. */
export type CaptureContextProps = CaptureWorkspaceProps;

/**
 * Embed the shared engine beneath the owning QueryClientProvider, without a router or destination links.
 * Reuse that cache across controlled view remounts to retain drafts, Files and exact pending commands.
 */
export function CaptureContext(props: CaptureContextProps) {
  return <CaptureWorkspace {...props} />;
}
