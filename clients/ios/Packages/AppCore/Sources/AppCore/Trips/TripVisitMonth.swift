/// A source month window, independent of exact arrival and departure.
public struct TripVisitMonth: Codable, Hashable, Sendable {
    public let year: Int
    public let month: Int
    public let part: String?

    /// Retains the supplied source values without filling absent components.
    public init(year: Int, month: Int, part: String?) {
        self.year = year
        self.month = month
        self.part = part
    }
}
