/// One explicit route occurrence; array order is independent of its optional dates.
public struct TripVisit: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let placeId: Int
    public let timing: TripVisitTiming
    public let notes: String
    public let sourceLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        tripId: Int,
        placeId: Int,
        timing: TripVisitTiming,
        notes: String,
        sourceLinks: [TripSourceLink]
    ) {
        self.id = id
        self.tripId = tripId
        self.placeId = placeId
        self.timing = timing
        self.notes = notes
        self.sourceLinks = sourceLinks
    }
}
