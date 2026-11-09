/** Approved immutable raw capture contracts remain distinct from local target organisation. */
export type { CaptureDraft, CapturedItem, CaptureState } from '../trip-quick-capture/model';
export type {
  InboxTargetKind,
  InboxAssociation,
  InboxState,
  InboxNewTargetDraft,
  InboxFilters,
  InboxRow,
  InboxScenario,
} from './types';
export { inboxTargetKinds, inboxIntentions, inboxArrangements } from './types';
export { inboxTargetLabel, inboxSourceRow, inboxRows } from './projection';
export { captureInboxItem, addInboxFiles, removeInboxFile } from './capture';
export {
  linkInboxSource,
  createInboxTarget,
  unlinkInboxAssociation,
  emptyInboxTargetDraft,
} from './organisation';
