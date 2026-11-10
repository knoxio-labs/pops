/// Metadata for a Documents-owned original, independent of any trip or Inventory association.
public struct DocumentOriginal: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let title: String
    public let created: String
    public let originalFileName: String
    public let thumbnailUrl: String

    /// Retains the owner's metadata; it does not describe local files or offline availability.
    public init(
        id: Int, title: String, created: String, originalFileName: String, thumbnailUrl: String
    ) {
        self.id = id
        self.title = title
        self.created = created
        self.originalFileName = originalFileName
        self.thumbnailUrl = thumbnailUrl
    }
}
