import { defineErrors } from '@pops/pillar-express';

/** Registered domain failures for the tags vocabulary contract. */
export const tagsErrors = defineErrors('tags', {
  not_found: {
    area: 'tag',
    status: 404,
    message: 'The requested tag was not found.',
    retryable: false,
  },
  name_conflict: {
    area: 'tag',
    status: 409,
    message: 'A tag with this facet and name already exists.',
    retryable: false,
  },
  unknown_facet: {
    area: 'tag',
    status: 422,
    message: 'The supplied facet is not supported.',
    retryable: false,
  },
  parent_invalid: {
    area: 'tag',
    status: 422,
    message: 'The selected parent tag is invalid.',
    retryable: false,
  },
  merge_invalid: {
    area: 'tag',
    status: 422,
    message: 'The requested tag merge is invalid.',
    retryable: false,
  },
  window_invalid: {
    area: 'tag',
    status: 422,
    message: 'The supplied tag window is invalid.',
    retryable: false,
  },
});
