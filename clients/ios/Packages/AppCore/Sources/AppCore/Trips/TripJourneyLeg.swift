/// An ordered source leg; intention, arrangement and purchase remain independent.
public struct TripJourneyLeg: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let journeyId: Int
    public let mode: String?
    public let from: TripEndpoint
    public let to: TripEndpoint
    public let intention: String?
    public let arrangement: String?
    public let purchase: String?
    public let `operator`: String?
    public let service: String?
    public let reference: String?
    public let notes: String
    public let sourceLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        journeyId: Int,
        mode: String?,
        from: TripEndpoint,
        to: TripEndpoint,
        intention: String?,
        arrangement: String?,
        purchase: String?,
        `operator`: String?,
        service: String?,
        reference: String?,
        notes: String,
        sourceLinks: [TripSourceLink]
    ) {
        self.id = id
        self.journeyId = journeyId
        self.mode = mode
        self.from = from
        self.to = to
        self.intention = intention
        self.arrangement = arrangement
        self.purchase = purchase
        self.operator = `operator`
        self.service = service
        self.reference = reference
        self.notes = notes
        self.sourceLinks = sourceLinks
    }
}
