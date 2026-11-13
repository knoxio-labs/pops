import { tripPlaceName } from '@/fixtures/trip-places';

import { Button, Sheet } from '@pops/ui';

import { CraftDocuments, CraftStayComposer, CraftThoughtComposer } from './panel-content';
import { CraftSourceDetails, sourceTitle } from './source-details';

import type { CraftTimeline } from '@/fixtures/trip-timeline-craft';

import type { CraftPanel } from './model';
import type { CraftWorkspace } from './use-workspace';

function panelTitle(panel: CraftPanel | null) {
  if (panel?.kind === 'source') return sourceTitle(panel.source);
  if (panel?.kind === 'documents') return 'Documents';
  if (panel?.kind === 'stay') return 'Add a stay idea';
  return 'Add to timeline';
}

function description(panel: CraftPanel | null, timeline: CraftTimeline) {
  if (!panel || panel.kind === 'source') return undefined;
  if (panel.kind === 'documents') return 'Files attached to this trip.';
  const visit = timeline.rows.find((row) => row.kind === 'visit' && row.id === panel.visitId);
  if (visit?.kind === 'visit') return tripPlaceName(visit.placeId);
  return 'A thought for this trip, without an assigned place or date.';
}

function footer(workspace: CraftWorkspace) {
  const { panel, draft } = workspace.state;
  if (!panel || (panel.kind !== 'capture' && panel.kind !== 'stay')) return null;
  return (
    <>
      <Button variant="ghost" onClick={workspace.close}>
        Cancel
      </Button>
      <Button disabled={!draft?.text.trim()} onClick={workspace.add}>
        {panel.kind === 'stay' ? 'Add stay idea' : 'Add thought'}
      </Button>
    </>
  );
}

function PanelContent({
  timeline,
  workspace,
}: {
  timeline: CraftTimeline;
  workspace: CraftWorkspace;
}) {
  const { panel, draft } = workspace.state;
  if (!panel) return null;
  const text = draft?.text ?? '';
  switch (panel.kind) {
    case 'source':
      return <CraftSourceDetails source={panel.source} />;
    case 'documents':
      return <CraftDocuments timeline={timeline} onClose={workspace.close} />;
    case 'capture':
      return <CraftThoughtComposer text={text} onChange={workspace.setText} />;
    case 'stay':
      return <CraftStayComposer gap={panel.gap} text={text} onChange={workspace.setText} />;
  }
}

/** One persistent Sheet wrapper preserves existing focus restoration across contextual views. */
export function CraftPanels({
  timeline,
  workspace,
}: {
  timeline: CraftTimeline;
  workspace: CraftWorkspace;
}) {
  const { panel } = workspace.state;
  return (
    <Sheet
      open={panel !== null}
      onOpenChange={(open) => {
        if (!open) workspace.close();
      }}
      title={panelTitle(panel)}
      description={description(panel, timeline)}
      footer={footer(workspace)}
    >
      <PanelContent timeline={timeline} workspace={workspace} />
    </Sheet>
  );
}
