import type {
  ArrangementResponsibilityContext,
  OverviewPlacementTarget,
  OverviewSource,
  OverviewTool,
} from '@pops/trips-workspace';

import type { ApiClients } from './api/types';
import type { CaptureContextProps } from './CaptureContext';

/** A contextual source or tool selection within the owning Trip Timeline. */
export type TimelineSelection =
  | { kind: 'source'; source: OverviewSource }
  | { kind: 'tool'; tool: OverviewTool }
  | { kind: 'metadata' }
  | { kind: 'placement'; target: OverviewPlacementTarget | null };

/** Canonical owner capabilities and controlled selection; the host retains its QueryClient. */
export interface TimelineContextProps extends Pick<
  CaptureContextProps,
  'tripId' | 'client' | 'contacts' | 'documentsClient'
> {
  tagsClient?: ApiClients['tagsClient'];
  contactChooserIntent?: ArrangementResponsibilityContext['contactChooserIntent'];
  advanceContactChooserIntent?: ArrangementResponsibilityContext['advanceContactChooserIntent'];
  selection: TimelineSelection | null;
  onSelect: (selection: TimelineSelection | null) => void;
}
