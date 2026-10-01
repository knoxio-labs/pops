/** Errors owned by the purchases reconciliation routes. */
export const RECONCILIATION_ERROR_DEFINITIONS = {
  link_not_found: {
    area: 'reconciliation',
    status: 404,
    message: 'The requested transaction link was not found.',
    retryable: false,
  },
  charge_already_linked: {
    area: 'reconciliation',
    status: 409,
    message: 'The charge was linked while you were choosing a transaction. Refresh the queue.',
    retryable: true,
  },
  finance_unavailable: {
    area: 'reconciliation',
    status: 503,
    message: 'Finance transactions are unavailable. Try again later.',
    retryable: true,
  },
  sweep_unavailable: {
    area: 'reconciliation',
    status: 503,
    message: 'Purchase reconciliation is unavailable.',
    retryable: false,
  },
} as const;
