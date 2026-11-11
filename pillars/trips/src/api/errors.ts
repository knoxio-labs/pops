import { defineErrors } from '@pops/pillar-express';

import { routeErrors } from './route-errors.js';

const recordErrors = defineErrors('trips', {
  meeting_revision_conflict: {
    area: 'meeting_plan',
    status: 409,
    message: 'This meeting plan changed. Read its confirmed revision before editing.',
    retryable: false,
  },
  meeting_revision_exhausted: {
    area: 'meeting_plan',
    status: 409,
    message: 'This meeting plan cannot advance beyond its safe source revision.',
    retryable: false,
  },
  meeting_undo_conflict: {
    area: 'meeting_plan',
    status: 409,
    message: 'Undo requires an untouched confirmed meeting-plan operation.',
    retryable: false,
  },
  meeting_operation_mismatch: {
    area: 'meeting_plan',
    status: 409,
    message: 'This operation identifier belongs to a different meeting-plan request.',
    retryable: false,
  },
  meeting_contact_unknown: {
    area: 'meeting_plan',
    status: 400,
    message: 'Choose an existing Contact identity.',
    retryable: false,
  },
  meeting_contact_unavailable: {
    area: 'meeting_plan',
    status: 503,
    message:
      'The selected Contact identity could not be verified. Retry when Contacts is available.',
    retryable: true,
  },
  source_referenced: {
    area: 'source',
    status: 409,
    message:
      'Remove active capture associations and Explore memberships before deleting this source.',
    retryable: false,
  },
  source_target_invalid: {
    area: 'source',
    status: 400,
    message: 'Explore membership requires a capture, Idea or Event source.',
    retryable: false,
  },
  source_revision_conflict: {
    area: 'source',
    status: 409,
    message: 'This source or relation changed. Read its current revision before editing.',
    retryable: false,
  },
  source_operation_mismatch: {
    area: 'source',
    status: 409,
    message: 'This operation identifier was already used with different source input.',
    retryable: false,
  },
  source_undo_conflict: {
    area: 'source',
    status: 409,
    message:
      'This operation cannot be undone because its records changed or are referenced. Nothing was changed.',
    retryable: false,
  },
  contact_unknown: {
    area: 'responsibility',
    status: 400,
    message: 'Choose an identity issued by Contacts.',
    retryable: false,
  },
  contacts_unavailable: {
    area: 'responsibility',
    status: 503,
    message: 'The selected contact could not be verified. Retry when Contacts is available.',
    retryable: true,
  },
  arrangement_revision_conflict: {
    area: 'arrangement',
    status: 409,
    message:
      'The arrangement changed or its revision cannot advance. Read its latest revision before editing.',
    retryable: false,
  },
  leg_revision_conflict: {
    area: 'journey_leg',
    status: 409,
    message: 'This journey’s legs changed. Read their current revision before retrying.',
    retryable: false,
  },
  leg_order_conflict: {
    area: 'journey_leg',
    status: 409,
    message: 'The live leg order changed. This removal cannot be undone against a different order.',
    retryable: false,
  },
  leg_removal_conflict: {
    area: 'journey_leg',
    status: 409,
    message: 'This removal identity belongs to a different intent or lifecycle.',
    retryable: false,
  },
  parent_invalid: {
    area: 'trip',
    status: 400,
    message: 'Choose an existing parent trip outside this trip and its descendants.',
    retryable: false,
  },
  tag_unknown: {
    area: 'trip',
    status: 400,
    message: 'Choose a shared tag known to the Tags-owned vocabulary.',
    retryable: false,
  },
  tags_unavailable: {
    area: 'trip',
    status: 503,
    message: 'The selected shared tag could not be verified. Retry when Tags is available.',
    retryable: true,
  },
  option_not_removed: {
    area: 'decision',
    status: 409,
    message: 'Only a removed decision option can be restored.',
    retryable: false,
  },
  decision_revision_conflict: {
    area: 'decision',
    status: 409,
    message:
      'This decision or its options changed. Read its latest revision before editing or selecting.',
    retryable: false,
  },
  visit_revision_conflict: {
    area: 'visit',
    status: 409,
    message: 'This visit changed. Read its latest revision before editing.',
    retryable: false,
  },
  visit_revision_exhausted: {
    area: 'visit',
    status: 409,
    message: 'This visit cannot accept another source revision.',
    retryable: false,
  },
  revision_conflict: {
    area: 'group',
    status: 409,
    message:
      'This journey group changed. Read its latest revision before changing selection or membership.',
    retryable: false,
  },
  journey_grouped: {
    area: 'group',
    status: 409,
    message: 'Remove this journey’s group memberships before deleting its source records.',
    retryable: false,
  },
  not_found: {
    area: 'record',
    status: 404,
    message: 'The requested owned record or journey group was not found.',
    retryable: false,
  },
  order_invalid: {
    area: 'route',
    status: 400,
    message:
      'Order must contain every existing member of the selected route or journey exactly once.',
    retryable: false,
  },
  association_invalid: {
    area: 'document',
    status: 400,
    message: 'Choose a document target belonging to this trip.',
    retryable: false,
  },
  association_exists: {
    area: 'document',
    status: 409,
    message: 'This document is already linked to the selected trip target.',
    retryable: false,
  },
});

/** Stable registered constructors for all Trips domain failures. */
export const tripsErrors = { ...recordErrors, ...routeErrors };
