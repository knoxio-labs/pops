/** Source operations retain canonical raw material, distinct IDs, exact commands and durable receipts. */
export const sourceOperations = {
  'captureWorkspace.get':
    'Read a consistent trip-scoped snapshot of captures, ideas, explicit associations, collection memberships and their referenced source records, including tombstones needed for replay and Undo.',
  'captures.create':
    'Capture verbatim source text, an original URL or accepted Documents task/document identities in the owning trip. Supply at least one real source; file metadata is not an attachment. An optional explicit target can be created/associated atomically while the capture keeps its own ID.',
  'captures.update':
    'Edit a capture’s presentation fields using its exact ID and observed revision. Its original text, original URL and accepted attachment identities are immutable source material.',
  'captures.attach':
    'Attach an actual accepted Documents task or original document identity to a capture with the observed capture revision. Preserve task provenance when the document resolves; never send file bytes or invented document IDs.',
  'captures.organise':
    'Explicitly associate a capture with an existing canonical Idea/Event/Journey/Stay or owner-issued Contacts reference, or explicitly create a supported target atomically. Classification alone does not organise a capture and source identity is retained.',
  'captures.remove':
    'Soft-remove the exact capture under its observed revision. Do not delete Documents originals or linked owner records.',
  'captures.removeAssociation':
    'Remove the exact capture association under its observed revision while retaining the capture, target identity and original source material.',
  'captures.undo':
    'Undo a capture-owned operation by its original operation UUID using a new Undo operation UUID. The producer checks revisions and foreign dependencies; conflicts must not be bypassed or replaced with a whole-workspace restore.',
  'ideas.create':
    'Save an independent idea in the owning trip with explicitly selected kind, purpose, status, timing, location and source/contact references. Missing optional details stay unknown. An idea or In plan status does not create a route visit.',
  'ideas.update':
    'Edit an independent idea using its exact ID and observed revision. Supply only intended fields; arrays/objects replace their recorded values. Contacts URIs must be issued by Contacts, never synthesized from a name.',
  'ideas.remove':
    'Soft-remove the exact idea under its observed revision; retain source identities and foreign originals.',
  'ideas.undo':
    'Undo an idea-owned operation by its original UUID using a new Undo UUID. Let the producer reject stale revisions or foreign dependencies.',
  'explore.add':
    'Explicitly add membership for a persisted capture, idea or event. Source kind and ID together identify the record; equal numeric IDs across kinds are distinct.',
  'explore.remove':
    'Remove only the exact collection membership under its observed revision. Its capture, idea or event remains a canonical source record.',
  'explore.undo':
    'Undo an Explore-membership operation with its original UUID and a new Undo UUID; this never grants permission to delete a foreign source.',
  'meetingPlans.list':
    'List the owning trip’s independent meeting plans and their retained Contacts references.',
  'meetingPlans.get':
    'Read one trip-owned meeting plan by exact ID, including its current revision and explicit contact/location/timing fields.',
  'meetingPlans.operate':
    'Apply the explicitly selected receipt-backed meeting-plan command using actual source IDs and required revisions. People remain Contacts-owned; this operation records a trip plan/reference, not a new person.',
};
