/** Source-backed Trips workspace components; shell activation is owned by its host. */
export { StayWorkspace } from './stay/StayWorkspace';
export type { StayWorkspaceProps } from './stay/types';
export { EventWorkspace } from './event/EventWorkspace';
export type { EventWorkspaceProps } from './event/types';

/** Options-first decision source workspace with revision-guarded persistence and Undo. */
export { DecisionWorkspace } from './decision/DecisionWorkspace';
export type { DecisionWorkspaceProps } from './decision/types';
export { JourneyWorkspace } from './journey/JourneyWorkspace';
export type { JourneyWorkspaceProps } from './journey/types';
export { VisitWorkspace } from './visit/VisitWorkspace';
export type { VisitWorkspaceProps } from './visit/types';
export { DocumentAssociationPicker } from './documents/DocumentAssociationPicker';
export { TripDocumentsWorkspace } from './documents/TripDocumentsWorkspace';
export type {
  DocumentAssociationTarget,
  TripDocumentsWorkspaceProps,
  TripDocumentAssociation,
} from './documents/types';

export { TripDocumentLinks } from './documents/TripDocumentLinks';
export { TripDocumentUpload } from './documents/TripDocumentUpload';
export type { TripDocumentUploadProps } from './documents/TripDocumentUpload';
export {
  createTripDocumentUploadSession,
  TripDocumentUploadContextError,
} from './documents/trip-document-upload-session';
export type {
  TripDocumentUploadContext,
  TripDocumentUploadSession,
} from './documents/trip-document-upload-session';

export { DocumentPicker } from './documents/DocumentPicker';
export type { DocumentPickerProps } from './documents/DocumentPicker';
export { useDocumentUpload } from './documents/useDocumentUpload';
export type {
  DocumentUploadController,
  DocumentUploadOptions,
} from './documents/useDocumentUpload';
export { createDocumentUploadSession } from './documents/useUploadFields';
export type { DocumentUploadSession } from './documents/useUploadFields';
export type { PaperlessSearchDocument } from './documents/types';
export { CalendarWorkspace } from './calendar/CalendarWorkspace';
export type { CalendarWorkspaceProps, CalendarSource } from './calendar/types';
