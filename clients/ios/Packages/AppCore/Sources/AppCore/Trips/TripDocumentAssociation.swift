import Foundation

/// An explicit trip-owned association to a Documents original; it never establishes file availability.
public struct TripDocumentAssociation: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let documentId: Int
    public let targetKind: String
    public let targetId: Int
    public let createdAt: Date

    /// Preserves association and original identities separately, including repeated original references.
    public init(
        id: Int, tripId: Int, documentId: Int, targetKind: String, targetId: Int, createdAt: Date
    ) {
        self.id = id
        self.tripId = tripId
        self.documentId = documentId
        self.targetKind = targetKind
        self.targetId = targetId
        self.createdAt = createdAt
    }
}
