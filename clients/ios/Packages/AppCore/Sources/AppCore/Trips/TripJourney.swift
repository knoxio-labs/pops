/// A source journey with independently ordered legs; membership does not imply selection.
public struct TripJourney: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let name: String?
    public let reference: String?
    public let notes: String
    public let sourceLinks: [TripSourceLink]
    public let buffers: TripJourneyBuffers
    public let legs: [TripJourneyLeg]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        tripId: Int,
        name: String?,
        reference: String?,
        notes: String,
        sourceLinks: [TripSourceLink],
        buffers: TripJourneyBuffers,
        legs: [TripJourneyLeg]
    ) {
        self.id = id
        self.tripId = tripId
        self.name = name
        self.reference = reference
        self.notes = notes
        self.sourceLinks = sourceLinks
        self.buffers = buffers
        self.legs = legs
    }
}
