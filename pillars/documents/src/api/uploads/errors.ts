import { defineErrors } from '@pops/pillar-express';

/** Registered upload-admission failures; none authorizes replay of a claimed upstream POST. */
export const uploadErrors = defineErrors('documents', {
  invalid: {
    area: 'upload',
    status: 400,
    message: 'The upload content does not match its immutable intent.',
    retryable: false,
  },
  not_found: {
    area: 'upload',
    status: 404,
    message: 'The upload operation does not exist.',
    retryable: false,
  },
  conflict: {
    area: 'upload',
    status: 409,
    message: 'The upload operation cannot be changed or dispatched in this state.',
    retryable: false,
  },
  owner_changed: {
    area: 'upload',
    status: 409,
    message: 'The configured Paperless owner differs from this upload intent.',
    retryable: false,
  },
  too_large: {
    area: 'upload',
    status: 413,
    message: 'The file is larger than the upload limit.',
    retryable: false,
  },
  unsupported_type: {
    area: 'upload',
    status: 415,
    message: 'This file type cannot be uploaded.',
    retryable: false,
  },
  storage: {
    area: 'upload',
    status: 503,
    message: 'Durable upload storage is unavailable.',
    retryable: true,
  },
});
