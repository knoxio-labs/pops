import Foundation

/// Producer-owned classification; choosing one never creates an Idea, event or booking.
public enum TripCaptureClassification: String, Codable, Hashable, Sendable {
    case idea, note, event, link, document
}

/// Canonical captured originals and independently editable presentation. Removed records remain identifiable.
public struct TripCaptureRecord: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let tripId: Int
    public let originalText: String
    public let originalUrl: String?
    public let attachments: [TripCaptureAttachment]
    public let title: String?
    public let notes: String
    public let classification: TripCaptureClassification?
    public let placeId: Int?
    public let visitId: Int?
    public let revision: Int
    public let removedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date

    /// Creates a record from explicit producer facts, without deriving a date or source relationship.
    public init(
        id: Int, tripId: Int, originalText: String, originalUrl: String?,
        attachments: [TripCaptureAttachment], title: String?, notes: String,
        classification: TripCaptureClassification?, placeId: Int?, visitId: Int?,
        revision: Int, removedAt: Date?, createdAt: Date, updatedAt: Date
    ) {
        self.id = id
        self.tripId = tripId
        self.originalText = originalText
        self.originalUrl = originalUrl
        self.attachments = attachments
        self.title = title
        self.notes = notes
        self.classification = classification
        self.placeId = placeId
        self.visitId = visitId
        self.revision = revision
        self.removedAt = removedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
