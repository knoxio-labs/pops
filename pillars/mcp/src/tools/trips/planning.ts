/** Explicit canonical planning tools; names and source identities are never inferred from labels. */
export const planningOperations = {
  'trips.list':
    'List canonical trips and their recorded planning metadata to find the owning trip ID.',
  'trips.get': 'Read one canonical trip by its ID before editing it or adding trip-owned records.',
  'trips.create':
    'Legacy non-idempotent creation of a permanent canonical trip. Prefer trips.trips.createOperation for a new caller-owned creation intent that may need exact replay. Name, destination and opaque when text are independent fields; this does not create places, visits or an itinerary.',
  'trips.createOperation':
    'Create a permanent canonical trip once for an explicit stable operationId UUID and trip.create command. Preserve the complete input exactly for replay. The original receipt and current Trip are separate; creation has no Undo. An unsupported producer is an explicit capability failure, never permission to fall back to legacy creation.',
  'trips.update':
    'Edit only supplied trip metadata. Omission preserves existing values; use only nulls permitted by the schema to clear fields. This does not edit the route.',
  'places.list':
    'List reusable canonical places to select an exact place ID. Equal names do not mean equal identities.',
  'places.get': 'Read a reusable canonical place by its ID.',
  'places.create':
    'Create an explicitly named reusable place. Creating a place does not add a visit to any trip.',
  'places.update': 'Edit a reusable place by its exact ID using only explicitly supplied fields.',
  'visits.list':
    'Read the recorded visits of one trip, including exact visit IDs and their reusable place references.',
  'visits.get': 'Read one trip-owned visit by its exact trip and visit IDs.',
  'visits.create':
    'Create an explicit visit to an existing place in the owning trip. Supply the actual placeId; do not infer it from a city label or idea. Timing and notes remain explicitly recorded.',
  'visits.update':
    'Edit an existing trip-owned visit. Retain any observed revision guard supplied by the caller; an optional unresolved reference does not justify inventing a replacement place.',
  'visits.reorder':
    'Set the explicit ordered visit ID list for the owning trip. Use actual persisted visit IDs, not names or route-gap IDs.',
  'route.get':
    'Read the canonical mixed route, its revision, persisted paths and explicit visit/journey identities before issuing a route command.',
  'route.operate':
    'Apply one explicit canonical route command against the observed route revision. The command schema declares supported placement, move and alternative-path operations; do not infer route membership from source creation.',
  'decisions.list': 'List trip-owned planning decisions and their recorded choices.',
  'decisions.get': 'Read one trip-owned decision by its exact ID.',
  'decisions.workspace':
    'Read the owning decision workspace and its current option records together before editing or selecting an option.',
  'decisions.create':
    'Create a canonical planning decision in the owning trip with the explicitly supplied fields.',
  'decisions.update': 'Edit a canonical decision using its owning trip and exact decision ID.',
  'decisions.select':
    'Explicitly select a persisted option for its owning decision. Read the decision workspace first and supply its actual IDs and required guards.',
  'decisions.delete':
    'Remove the specified trip-owned decision using the published producer operation. This is a mutation, not a preview.',
  'decisionOptions.list': 'List the canonical options belonging to an exact trip-owned decision.',
  'decisionOptions.get':
    'Read one persisted decision option by the exact owning trip, decision and option IDs.',
  'decisionOptions.create':
    'Add an explicit option to an existing canonical decision; option creation does not imply selection.',
  'decisionOptions.update':
    'Edit only the supplied fields of an existing canonical decision option.',
  'decisionOptions.delete':
    'Remove the specified canonical decision option through its owning producer operation.',
  'decisionOptions.restore':
    'Restore the specified removed canonical decision option through its owning producer operation; do not create a substitute option ID.',
};
