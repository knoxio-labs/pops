/** Source-backed Trips workspace components; shell activation is owned by its host. */
export { loadTripRoute, applyRouteOperation, RouteContextError } from './route/api';
export { projectTripRoute } from './route/projection';
export type {
  ProjectedRouteSource,
  ProjectedRouteItem,
  ProjectedRoutePath,
  RouteProjection,
  RouteSourceContext,
} from './route/projection';
export { routeSession } from './route/registry';
export type { RouteBinding } from './route/registry';
export { RouteSession } from './route/session';
export type { RouteFailure, RouteSessionSnapshot } from './route/session-state';
export { useTripRoute } from './route/use-trip-route';
export type { TripRouteController } from './route/use-trip-route';
export type {
  TripRouteRead,
  TripRoute,
  RouteOperation,
  RouteCommand,
  RouteEditCommand,
  RouteOperationResult,
  RouteReceipt,
  RouteIdentity,
  RouteOwner,
  RouteItem,
  RouteSource,
  RoutePath,
  RouteView,
} from './route/types';

export { StayWorkspace } from './stay/StayWorkspace';
export type { StayWorkspaceProps } from './stay/types';
export { EventWorkspace } from './event/EventWorkspace';
export type { EventWorkspaceProps } from './event/types';

/** Options-first decision source workspace with revision-guarded persistence and Undo. */
export { DecisionWorkspace } from './decision/DecisionWorkspace';
export type { DecisionWorkspaceProps } from './decision/types';
export { JourneyWorkspace } from './journey/JourneyWorkspace';
export type { JourneyWorkspaceProps } from './journey/types';

/** Trip-owned meeting plans grouped by exact route Visit occurrences. */
export { PeopleWorkspace } from './people/PeopleWorkspace';
export type {
  PeopleWorkspaceProps,
  MeetingContact,
  PeopleText,
  PeopleTextKey,
} from './people/types';
export { TripOverview } from './overview/TripOverview';
export type {
  TripOverviewProps,
  OverviewLabels,
  OverviewKind,
  OverviewPlacementTarget,
  OverviewLinkKind,
  OverviewSource,
  OverviewTool,
  OverviewCalendarSelection,
  OverviewCalendarControl,
} from './overview/types';
export { ArrangementsWorkspace } from './arrangements/ArrangementsWorkspace';
export type { ArrangementsWorkspaceProps, ArrangementLabels } from './arrangements/types';
export { RentalWorkspace as RentalContextEditor } from './arrangements/RentalWorkspace';
export type {
  RentalContext,
  RentalContextEditorProps,
  RentalLabels,
  RentalSourceContext,
} from './arrangements/rental-context';
export type { Rental, RentalPatch } from './arrangements/types';
export { Responsibility as ArrangementResponsibilityField } from './arrangements/Responsibility';
export { ResponsibilitySessions as ArrangementResponsibilityProvider } from './arrangements/ResponsibilitySessions';
export type { ArrangementTarget, ArrangementResponsibility } from './arrangements/types';
export type {
  ArrangementResponsibilityContext,
  ArrangementResponsibilityFieldProps,
  ArrangementResponsibilityProviderProps,
  ResponsibilityLabels,
} from './arrangements/responsibility-context';
/** Locale-aware calendar source formatter; absent clocks never become viewer-local instants. */
export { dateLabel as formatTripDate } from './visit/periods';
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

/** Shared text-first Capture, inline Inbox and Explore source surfaces. */
export { CaptureWorkspace } from './capture/CaptureWorkspace';
export { IdeaCreateContext } from './capture/IdeaCreateContext';
export type { IdeaCreateContextProps } from './capture/IdeaCreateContext';
export type { CaptureWorkspaceProps, CaptureSourceSelection } from './capture/types';

/** Captured source ownership and retained view lifetimes shared by contextual app editors. */
export {
  RetainedSessionStore,
  assertSourceOwner,
  isSourceOwnerCurrent,
  sourceOwnerProblem,
} from './shared/retained-session-store';
export type { RetainedSourceOwner } from './shared/retained-session-store';
export { useRetainedSession } from './shared/use-retained-session';
export { useSessionView } from './shared/use-session-view';
export { useSourceQuery } from './shared/use-source-query';
/** Generated canonical metadata response validation; no alternate Trip model is introduced. */
export {
  zTripsGetResponse as tripMetadataReadSchema,
  zTripsUpdateResponse as tripMetadataWriteSchema,
} from './trips-api/zod.gen';

export {
  AccommodationGapProvider,
  AccommodationGapContext,
} from './arrangements/AccommodationGapContext';
export type {
  AccommodationGapIdentity,
  AccommodationGapLabels,
  AccommodationGapStay,
  AccommodationGapProviderProps,
  AccommodationGapContextProps,
} from './arrangements/accommodation-gap-types';
