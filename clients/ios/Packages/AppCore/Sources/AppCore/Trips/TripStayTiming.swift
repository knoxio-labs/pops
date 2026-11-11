/// Optional local stay dates, clocks and IANA zone; missing components remain unknown.
public struct TripStayTiming: Codable, Hashable, Sendable {
    public let arrival: String?
    public let departure: String?
    public let checkIn: String?
    public let checkOut: String?
    public let timeZone: String?

    /// Retains the supplied source values without filling absent components.
    public init(
        arrival: String?, departure: String?, checkIn: String?, checkOut: String?, timeZone: String?
    ) {
        self.arrival = arrival
        self.departure = departure
        self.checkIn = checkIn
        self.checkOut = checkOut
        self.timeZone = timeZone
    }
}
