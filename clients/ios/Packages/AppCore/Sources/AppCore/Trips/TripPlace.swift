/// A reusable exact source place identity without inferred geography.
public struct TripPlace: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let sourceLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        name: String,
        sourceLinks: [TripSourceLink]
    ) {
        self.id = id
        self.name = name
        self.sourceLinks = sourceLinks
    }
}
