/// Independent source day or local datetime, location and zone; no inferred clock or UTC fallback.
public struct TripEndpoint: Codable, Hashable, Sendable {
    public let placeId: Int?
    public let sourceLabel: String?
    public let sourceLinks: [TripSourceLink]?
    public let local: String?
    public let timeZone: String?
    public let date: String?

    /// Retains the supplied source values without filling absent components.
    public init(
        placeId: Int?, sourceLabel: String?, sourceLinks: [TripSourceLink]?, local: String?,
        timeZone: String?, date: String? = nil
    ) {
        self.placeId = placeId
        self.sourceLabel = sourceLabel
        self.sourceLinks = sourceLinks
        self.local = local
        self.timeZone = timeZone
        self.date = date
    }
}
