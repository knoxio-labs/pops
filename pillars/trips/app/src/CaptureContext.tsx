import { CaptureWorkspace } from '@pops/trips-workspace';

import type { CaptureWorkspaceProps } from '@pops/trips-workspace';

/** Owning-trip contextual tools; the host controls the view, exact selected source, transports and Event opening. */
export type CaptureContextProps = CaptureWorkspaceProps;

/**
 * Embed the shared engine beneath the owning QueryClientProvider, without a router or destination links.
 * Reuse that cache across controlled view remounts to retain drafts, Files and exact pending commands.
 * selectedSource opens only its exact active Capture/Idea; null/undefined preserve the ordinary tool view.
 */
export function CaptureContext(props: CaptureContextProps) {
  return <CaptureWorkspace {...props} />;
}
