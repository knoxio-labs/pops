/// Read-only trip source access. Implementations fail partial aggregates rather than returning false emptiness.
public protocol TripsReading: Sendable {
    /// Reads all permitted trip metadata, consuming the transport's cursor pages without truncation.
    /// Snapshot invalidation follows TripsReadPolicy; exhaustion is a recoverable source-changed conflict.
    func trips() async throws -> [TripRecord]

    /// Reads exact source records and authoritative visit/leg order; nil means the trip no longer exists.
    func trip(id: Int) async throws -> TripSnapshot?
}

/// One complete source read; visits and journey legs retain their authoritative order.
public struct TripSnapshot: Codable, Hashable, Sendable {
    public let trip: TripRecord
    public let places: [TripPlace]
    public let visits: [TripVisit]
    public let journeys: [TripJourney]
    public let journeyGroups: [TripJourneyGroup]
    public let stays: [TripStay]
    public let events: [TripEvent]
    public let documentAssociations: [TripDocumentAssociation]

    /// Creates an aggregate without inferring relationships or selecting alternatives.
    public init(
        trip: TripRecord, places: [TripPlace], visits: [TripVisit], journeys: [TripJourney],
        journeyGroups: [TripJourneyGroup], stays: [TripStay], events: [TripEvent],
        documentAssociations: [TripDocumentAssociation]
    ) {
        self.trip = trip
        self.places = places
        self.visits = visits
        self.journeys = journeys
        self.journeyGroups = journeyGroups
        self.stays = stays
        self.events = events
        self.documentAssociations = documentAssociations
    }
}
