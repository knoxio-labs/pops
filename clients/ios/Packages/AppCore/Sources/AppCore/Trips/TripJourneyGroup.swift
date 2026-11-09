/// Explicit current and alternative journey membership without copied source records.
public struct TripJourneyGroup: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let currentJourneyId: Int
    public let alternativeJourneyIds: [Int]
    public let revision: Int

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        tripId: Int,
        currentJourneyId: Int,
        alternativeJourneyIds: [Int],
        revision: Int
    ) {
        self.id = id
        self.tripId = tripId
        self.currentJourneyId = currentJourneyId
        self.alternativeJourneyIds = alternativeJourneyIds
        self.revision = revision
    }
}
