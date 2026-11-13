import AppCore

internal enum TripPlanLineIdentity: Hashable {
    case root(TripRouteItem)
    case path(Int, TripRouteSource)
    case recordedVisit(Int)
    case recordedSource(String)
}

internal struct TripPlanLineItem: Identifiable, Equatable {
    internal enum Content: Equatable {
        case visit(TripVisit, place: String, sources: [TripSource])
        case source(TripSource)
        case missing(TripRouteSource)
        case unavailable(TripRouteSource)
        case gap(Int)
    }

    internal let id: TripPlanLineIdentity
    internal let content: Content
    internal let paths: [TripPlanLinePath]
}

internal struct TripPlanLinePath: Identifiable, Equatable {
    internal let id: Int
    internal let title: String
    internal let state: TripRoutePath.State
    internal let members: [TripPlanLineItem]
}
