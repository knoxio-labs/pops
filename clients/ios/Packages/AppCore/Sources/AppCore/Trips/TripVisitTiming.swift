/// Independent date-only bounds and optional source windows; no clocks are implied.
public struct TripVisitTiming: Codable, Hashable, Sendable {
    public let arrival: String?
    public let departure: String?
    public let month: TripVisitMonth?
    public let duration: TripVisitDuration?

    /// Retains the supplied source values without filling absent components.
    public init(
        arrival: String?, departure: String?, month: TripVisitMonth?, duration: TripVisitDuration?
    ) {
        self.arrival = arrival
        self.departure = departure
        self.month = month
        self.duration = duration
    }
}
