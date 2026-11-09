/// An explicit source duration range; no date is inferred from it.
public struct TripVisitDuration: Codable, Hashable, Sendable {
    public let min: Double
    public let max: Double
    public let unit: String

    /// Retains the supplied source values without filling absent components.
    public init(min: Double, max: Double, unit: String) {
        self.min = min
        self.max = max
        self.unit = unit
    }
}
