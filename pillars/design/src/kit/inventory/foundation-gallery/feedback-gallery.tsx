/**
 * Feedback: the undo toast in its three states, stacked where sonner puts
 * them, and the state banner for each way data can be less than fine.
 */
import { StateBanner } from '../shared/state-banner';
import { UndoToast } from '../shared/undo-toast';
import { Specimen } from './gallery-frame';

/** Undo toasts: offered, undone, and refused because the item changed. */
export function ToastsGallery() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Undo toast" note="8 seconds; the key works only while it shows.">
        <div className="space-y-3">
          <UndoToast concept="move" message="Moved 5 items to Shelving" />
          <UndoToast concept="pickUp" message="Picked up Tape measure" />
          <UndoToast concept="retired" message="Retired Film camera" />
        </div>
      </Specimen>
      <Specimen label="After Undo" note="Undo is a new event, so it can be refused.">
        <div className="space-y-3">
          <UndoToast concept="move" message="Moved 5 items to Shelving" state="undone" />
          <UndoToast concept="move" message="Moved Kitchen 12 to Garage" state="conflict" />
        </div>
      </Specimen>
    </div>
  );
}

/** One banner per data state, each with its single action. */
export function BannersGallery() {
  return (
    <Specimen label="State banners" note="One sentence of state, one action.">
      <div className="max-w-3xl space-y-2">
        <StateBanner
          kind="stale"
          title="Changed on iPhone 2 minutes ago."
          detail="Your selection stays until you reload."
          actionLabel="Reload"
        />
        <StateBanner
          kind="offline"
          title="No connection. Showing what loaded."
          detail="Changes are off until the connection is back."
        />
        <StateBanner
          kind="conflict"
          title="Two edits to Manufacturer disagree."
          detail="Here: LG. On iPhone: Samsung. Choose one in Sync."
          actionLabel="Resolve"
        />
        <StateBanner
          kind="needs-attention"
          title="3 items need a decision after the last sync."
          actionLabel="Open Sync"
        />
        <StateBanner
          kind="error"
          title="Items did not load."
          detail="The inventory service did not answer."
          actionLabel="Retry"
        />
      </div>
    </Specimen>
  );
}
