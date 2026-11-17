/** Import tools keep selected source, provider, human review and canonical writes separate. */
export const bookingImportOperations = {
  'bookingImports.bind':
    'Bind an explicitly selected active Capture or Documents original to this trip using its exact owner-issued identity. This verifies the original and stores no duplicate bytes; it does not extract or create a booking.',
  'bookingImports.get':
    'Read one trip-owned import source with its bindings, extraction attempts, human decisions and accepted canonical receipts. Unknown attempts remain visible and must not be resent automatically.',
  'bookingImports.extract':
    'Extract candidate booking facts from one explicitly selected, already-bound original using the explicitly named configured provider and model. Only call after the user chooses to send this original to that provider. Extraction never writes a booking; an unconfirmed provider outcome is retained as unknown and never dispatched again automatically.',
  'bookingImports.review':
    'Record the user’s explicit proposal selection and exact canonical target for one current extraction attempt. Review does not write or edit a canonical booking.',
  'bookingImports.commit':
    'Commit explicitly reviewed import decisions through the canonical trip booking operations. Supply only user-approved decision IDs; preserve the returned child receipts and current state.',
};
