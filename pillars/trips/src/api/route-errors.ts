import { defineErrors } from '@pops/pillar-express';

/** Registered aggregate CAS, exclusive placement, replay and own-Undo failures. */
export const routeErrors = defineErrors('trips', {
  route_draft_conflict: {
    area: 'route',
    status: 409,
    message: 'The draft deletion preview or its source lifecycle changed. Preview again.',
    retryable: false,
  },
  route_draft_undo_conflict: {
    area: 'route',
    status: 409,
    message: 'Undo requires the owned draft deletion outcome and source lifecycle.',
    retryable: false,
  },
  route_revision_conflict: {
    area: 'route',
    status: 409,
    message: 'The route changed or cannot advance. Read its current revision.',
    retryable: false,
  },
  route_membership_conflict: {
    area: 'route',
    status: 409,
    message: 'The explicit route container or insertion anchor no longer permits this move.',
    retryable: false,
  },
  route_operation_mismatch: {
    area: 'route',
    status: 409,
    message: 'This operation identifier belongs to a different route request.',
    retryable: false,
  },
  route_undo_conflict: {
    area: 'route',
    status: 409,
    message: 'Undo requires the untouched confirmed route outcome.',
    retryable: false,
  },
});
