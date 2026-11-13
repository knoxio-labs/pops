import Foundation

/// Verbatim source material with optional presentation and accepted Documents identities.
public struct TripCaptureInput: Codable, Hashable, Sendable {
    public var originalText: String
    public var originalUrl: String?
    public var attachments: [TripCaptureAttachment]
    public var title: String?
    public var notes: String
    public var classification: TripCaptureClassification?
    public var placeId: Int?
    public var visitId: Int?

    /// Creates an unsent draft; validation never trims or replaces its captured bytes.
    public init(
        originalText: String = "", originalUrl: String? = nil,
        attachments: [TripCaptureAttachment] = [], title: String? = nil,
        notes: String = "", classification: TripCaptureClassification? = nil,
        placeId: Int? = nil, visitId: Int? = nil
    ) {
        self.originalText = originalText
        self.originalUrl = originalUrl
        self.attachments = attachments
        self.title = title
        self.notes = notes
        self.classification = classification
        self.placeId = placeId
        self.visitId = visitId
    }

    /// Mirrors the producer's material requirement; local files do not count as accepted attachments.
    public var hasSourceMaterial: Bool {
        !originalText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(originalUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            || !attachments.isEmpty
    }
}
