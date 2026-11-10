/// Independent endpoint source identity, local clock and IANA zone; no UTC fallback.
public struct TripEndpoint: Codable, Hashable, Sendable {
    public let placeId: Int?
    public let sourceLabel: String?
    public let sourceLinks: [TripSourceLink]?
    public let local: String?
    public let timeZone: String?

    /// Retains the supplied source values without filling absent components.
    public init(
        placeId: Int?, sourceLabel: String?, sourceLinks: [TripSourceLink]?, local: String?,
        timeZone: String?
    ) {
        self.placeId = placeId
        self.sourceLabel = sourceLabel
        self.sourceLinks = sourceLinks
        self.local = local
        self.timeZone = timeZone
    }
}
