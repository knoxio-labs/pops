/// Trip-owned metadata; when is opaque text and never supplies route dates.
public struct TripRecord: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let name: String?
    public let destination: String
    public let when: String
    public let tagId: String?
    public let parentId: Int?
    public let notes: String
    public let sourceLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        name: String?,
        destination: String,
        when: String,
        tagId: String?,
        parentId: Int?,
        notes: String,
        sourceLinks: [TripSourceLink]
    ) {
        self.id = id
        self.name = name
        self.destination = destination
        self.when = when
        self.tagId = tagId
        self.parentId = parentId
        self.notes = notes
        self.sourceLinks = sourceLinks
    }
}
