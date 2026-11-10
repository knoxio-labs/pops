/// Trip-owned event facts; intention, arrangement and purchase are independent source values.
public struct TripEvent: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let visitId: Int?
    public let name: String?
    public let intention: String?
    public let arrangement: String?
    public let purchase: String?
    public let timing: TripEventTiming
    public let address: String?
    public let reference: String?
    public let sourceUrl: String?
    public let ticketUrl: String?
    public let notes: String
    public let sourceLinks: [TripSourceLink]
    public let venueLinks: [TripSourceLink]
    public let organiserLinks: [TripSourceLink]
    public let documentLinks: [TripSourceLink]

    /// Creates an exact source value without inferring booking state, file availability or clocks.
    public init(
        id: Int, tripId: Int, visitId: Int?, name: String?, intention: String?,
        arrangement: String?, purchase: String?, timing: TripEventTiming, address: String?,
        reference: String?, sourceUrl: String?, ticketUrl: String?, notes: String,
        sourceLinks: [TripSourceLink], venueLinks: [TripSourceLink],
        organiserLinks: [TripSourceLink], documentLinks: [TripSourceLink]
    ) {
        self.id = id
        self.tripId = tripId
        self.visitId = visitId
        self.name = name
        self.intention = intention
        self.arrangement = arrangement
        self.purchase = purchase
        self.timing = timing
        self.address = address
        self.reference = reference
        self.sourceUrl = sourceUrl
        self.ticketUrl = ticketUrl
        self.notes = notes
        self.sourceLinks = sourceLinks
        self.venueLinks = venueLinks
        self.organiserLinks = organiserLinks
        self.documentLinks = documentLinks
    }
}
