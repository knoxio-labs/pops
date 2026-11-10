/// Explicit source thresholds in physical minutes; absent values have no default.
public struct TripJourneyBuffers: Codable, Hashable, Sendable {
    public let minimumConnectionMinutes: Double?
    public let airportBufferMinutes: Double?

    /// Retains the supplied source values without filling absent components.
    public init(minimumConnectionMinutes: Double?, airportBufferMinutes: Double?) {
        self.minimumConnectionMinutes = minimumConnectionMinutes
        self.airportBufferMinutes = airportBufferMinutes
    }
}
