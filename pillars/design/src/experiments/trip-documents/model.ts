/** Approved original, association and target source contracts remain unchanged in this ledger. */
export type { DocumentRecord, DocumentTarget, DocumentLink } from '../trip-document-linking/model';
export type {
  DocumentVisit,
  DocumentTargetVisit,
  DocumentOfflineFact,
  DocumentProvenance,
  TripDocumentsState,
  TripDocumentFilters,
  DocumentRow,
  TripDocumentOccurrence,
  TripDocumentsScenario,
} from './types';
export {
  documentRows,
  documentOccurrences,
  groupDocumentOccurrences,
  tripDocumentFindings,
} from './projection';
export {
  setTripDocumentTarget,
  toggleTripDocumentSelection,
  attachTripDocumentSelection,
  unlinkTripDocument,
  addTripDocumentFiles,
  removeTripDocumentFile,
} from './actions';
