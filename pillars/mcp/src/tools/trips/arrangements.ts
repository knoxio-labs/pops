/** Canonical bookings and their explicit references; source creation never guesses route placement. */
export const arrangementOperations = {
  'events.list':
    'List canonical events in the owning trip, including recorded intentions and arrangements.',
  'events.get':
    'Read an event by its exact owning trip and event ID before editing its recorded booking details.',
  'events.create':
    'Create an explicit event/activity booking source with only supplied venue, timing, arrangement, intention, ticket, organiser and document/source references. Optional visit linkage requires an actual visit ID; source creation does not insert a route visit.',
  'events.update':
    'Edit the recorded fields of an existing event, preserving omitted values and supplied revision guards. Keep sourceUrl and ticketUrl independent; do not interpret an opaque URL as booking data.',
  'events.delete':
    'Soft-delete the specified canonical event through the owning producer, respecting its published revision/dependency guards.',
  'stays.list': 'List recorded stays/accommodation sources for the owning trip.',
  'stays.get':
    'Read a stay by exact trip and stay IDs, including its own recorded timing/status/references.',
  'stays.create':
    'Record explicit accommodation details, status, timing, hosts and document/source references in the owning trip. A visit link is optional and must use an existing visit ID; no visit or coverage interval is invented.',
  'stays.update':
    'Edit a canonical stay with only intended fields and required revision guard. Preserve independent booking details and explicit visit identity.',
  'stays.delete':
    'Soft-delete the specified canonical stay through the owning producer and its dependency/revision checks.',
  'rentals.list': 'List the owning trip’s canonical rental arrangements.',
  'rentals.get': 'Read one canonical rental by its owning trip and exact ID.',
  'rentals.create':
    'Create a rental from explicitly supplied provider, status, pickup/return visit IDs and start/end source timing. No journey, route segment or vehicle identity is inferred.',
  'rentals.update':
    'Edit the recorded rental using the actual trip/rental IDs and required revision guard, preserving omitted optional values.',
  'rentals.delete':
    'Soft-delete the specified canonical rental through its published revision/dependency checks.',
  'responsibilities.list':
    'Read explicit Handled by assignments for the owning trip’s whole journey/stay/event/rental arrangements.',
  'responsibilities.get':
    'Read the current assignment and revision for an exact whole-arrangement target kind and ID. Unset assignment is distinct from a Contacts identity.',
  'responsibilities.replace':
    'Explicitly replace or clear a whole arrangement’s Handled by assignment using the observed revision. Select self or an actual Contacts-issued URI; this is coordination metadata, not an access grant or person creation.',
  'journeys.list': 'List independent canonical journey sources in the owning trip.',
  'journeys.get': 'Read one trip-owned journey source by its actual ID.',
  'journeys.create':
    'Create an independent journey source with explicitly supplied details. Creating a journey does not insert it into the route or invent transport legs.',
  'journeys.update':
    'Edit only the supplied details of a canonical journey using the exact trip/journey IDs and published guards.',
  'journeys.delete':
    'Soft-delete the specified canonical journey through its owning producer and dependency/revision checks.',
  'journeys.timing':
    'Read the producer’s current timing projection for the exact journey rather than deriving a different timing model in the gateway.',
  'journeys.workspace':
    'Read the exact journey workspace, current legs and revisions together before making transport edits.',
  'journeyLegs.list': 'List persisted transport legs belonging to the exact trip-owned journey.',
  'journeyLegs.get': 'Read one transport leg using its exact trip, journey and leg IDs.',
  'journeyLegs.create':
    'Record an explicit transport leg under its owning journey, preserving supplied transport/timing/source fields and guard values. Endpoint date records a known day without a clock; do not invent local or timeZone.',
  'journeyLegs.update':
    'Edit the exact journey leg with explicitly supplied fields and the producer’s required revision guard. An omitted endpoint date preserves its known day, date:null clears it, and local selects datetime precision. Never send both nonnull date and local.',
  'journeyLegs.delete':
    'Delete the exact journey leg through the published producer operation; do not silently replace this action with removal or reorder.',
  'journeyLegs.remove':
    'Apply the published journey-leg removal command, retaining its exact removal/revision/Undo metadata for recovery.',
  'journeyLegs.restore':
    'Restore a previously removed journey leg using the owning producer’s original removal metadata and guards, preserving its identity.',
  'journeyLegs.reorder':
    'Set the explicit persisted leg ordering for the exact journey with the producer’s required ordering/revision metadata.',
  'journeyGroups.list': 'List the owning trip’s canonical journey-choice groups.',
  'journeyGroups.get': 'Read a persisted journey-choice group and its current explicit selection.',
  'journeyGroups.create':
    'Create an explicit canonical journey-choice group using existing source identities and published guard fields; do not choose a journey implicitly.',
  'journeyGroups.addBlank':
    'Add the explicitly requested blank journey alternative to its owning persisted group through the canonical producer operation.',
  'journeyGroups.select':
    'Explicitly select the requested persisted journey alternative in its owning group with the published revision guards.',
  'journeyGroups.delete':
    'Remove the exact canonical journey group through its producer operation; do not guess which journey alternative should replace it.',
  'documentAssociations.list':
    'Read the owning trip’s explicit links to Documents originals, including exact target kind and ID.',
  'documentAssociations.create':
    'Link an existing Documents original ID to an exact trip/visit/journey/stay/event target. The document remains Documents-owned; this operation neither uploads bytes nor fabricates a booking target.',
  'documentAssociations.delete':
    'Unlink the exact Trips document-association ID. The original document remains in Documents/Paperless and other associations remain intact.',
};
