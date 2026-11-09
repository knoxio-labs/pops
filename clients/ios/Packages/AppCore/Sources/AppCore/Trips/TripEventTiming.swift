/// Independent event dates, local clocks and source zone; absent values never imply midnight.
public struct TripEventTiming: Codable, Hashable, Sendable {
    public let start: String?
    public let end: String?
    public let startTime: String?
    public let endTime: String?
    public let timeZone: String?

    /// Retains the supplied source facts without deriving a bound or time zone.
    public init(
        start: String?, end: String?, startTime: String?, endTime: String?, timeZone: String?
    ) {
        self.start = start
        self.end = end
        self.startTime = startTime
        self.endTime = endTime
        self.timeZone = timeZone
    }
}
