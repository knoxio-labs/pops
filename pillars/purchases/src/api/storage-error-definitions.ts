export const storageErrorDefinitions = {
  unique_conflict: {
    area: 'storage',
    status: 409,
    message: 'A purchase record with that identity already exists.',
    retryable: false,
  },
  foreign_key_conflict: {
    area: 'storage',
    status: 409,
    message: 'The operation refers to a purchases resource that does not exist.',
    retryable: false,
  },
  check_failed: {
    area: 'storage',
    status: 400,
    message: 'The request contains a value purchases cannot accept.',
    retryable: false,
  },
  database_busy: {
    area: 'storage',
    status: 503,
    message: 'Purchase storage is busy. Retry this request shortly.',
    retryable: true,
  },
} as const;
