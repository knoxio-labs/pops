/// Independent stay dates, optional clocks and source references; departure is checkout-exclusive.
public struct TripStay: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let visitId: Int?
    public let name: String?
    public let kind: String?
    public let status: String?
    public let timing: TripStayTiming
    public let address: String?
    public let reference: String?
    public let notes: String
    public let sourceLinks: [TripSourceLink]
    public let hostLinks: [TripSourceLink]
    public let documentLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        tripId: Int,
        visitId: Int?,
        name: String?,
        kind: String?,
        status: String?,
        timing: TripStayTiming,
        address: String?,
        reference: String?,
        notes: String,
        sourceLinks: [TripSourceLink],
        hostLinks: [TripSourceLink],
        documentLinks: [TripSourceLink]
    ) {
        self.id = id
        self.tripId = tripId
        self.visitId = visitId
        self.name = name
        self.kind = kind
        self.status = status
        self.timing = timing
        self.address = address
        self.reference = reference
        self.notes = notes
        self.sourceLinks = sourceLinks
        self.hostLinks = hostLinks
        self.documentLinks = documentLinks
    }
}
