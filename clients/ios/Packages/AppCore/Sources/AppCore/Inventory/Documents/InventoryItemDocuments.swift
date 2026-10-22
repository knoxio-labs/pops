import Foundation

/// What a document linked to an item is: inventory's `DOCUMENT_TYPES`.
///
/// bfm sends the kind as an open string so a kind inventory adds still
/// decodes on an installed app; this build reads one it does not know as
/// ``other``.
public enum InventoryDocumentKind: String, CaseIterable, Codable, Hashable, Sendable {
    case receipt
    case warranty
    case manual
    case invoice
    case other

    /// The kind named by a wire value, ``other`` for one this build does not know.
    public init(wire: String) {
        self = Self(rawValue: wire) ?? .other
    }
}

/// A Paperless document linked to an item. Unlinking it keeps the file in
/// Paperless.
public struct InventoryLinkedDocument: Identifiable, Codable, Hashable, Sendable {
    /// The link's id, which the file, edit and unlink routes take.
    public let id: Int
    public let paperlessDocumentId: Int
    public let kind: InventoryDocumentKind
    public let title: String?
    public let presence: Presence

    /// Whether Paperless still has the document.
    public enum Presence: String, Codable, Hashable, Sendable {
        case present
        case missing
        /// Paperless could not be asked.
        case unknown
    }

    public init(
        id: Int, paperlessDocumentId: Int, kind: InventoryDocumentKind, title: String?,
        presence: Presence
    ) {
        self.id = id
        self.paperlessDocumentId = paperlessDocumentId
        self.kind = kind
        self.title = title
        self.presence = presence
    }
}

/// An upload Paperless has not turned into a link: still being consumed, or
/// refused and kept until dismissed.
public struct InventoryDocumentIngestion: Identifiable, Codable, Hashable, Sendable {
    public enum State: String, Codable, Hashable, Sendable {
        case pending
        case failed
    }

    public let id: Int
    public let kind: InventoryDocumentKind
    public let title: String?
    public let fileName: String
    public let state: State
    /// Why Paperless refused it, in its own words.
    public let reason: String?

    public init(
        id: Int, kind: InventoryDocumentKind, title: String?, fileName: String, state: State,
        reason: String?
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.fileName = fileName
        self.state = state
        self.reason = reason
    }
}

/// The documents pillar's upload limits, as bfm relays them. Either is `nil`
/// when Paperless could not be asked; the upload enforces both regardless.
public struct InventoryDocumentUploadLimits: Codable, Hashable, Sendable {
    public let maxUploadBytes: Int?
    /// MIME types or `type/*` families, e.g. `application/pdf`, `image/*`.
    public let allowedMimeTypes: [String]?

    public init(maxUploadBytes: Int?, allowedMimeTypes: [String]?) {
        self.maxUploadBytes = maxUploadBytes
        self.allowedMimeTypes = allowedMimeTypes
    }

    /// Why an upload of this size and type would be refused, or `nil` when
    /// the limits allow it or are unknown.
    public func refusal(byteCount: Int, mimeType: String) -> InventoryDocumentUploadRefusal? {
        if let maxUploadBytes, byteCount > maxUploadBytes {
            return .tooLarge(maxUploadBytes: maxUploadBytes)
        }
        if let allowedMimeTypes, !Self.allows(mimeType, in: allowedMimeTypes) {
            return .unsupportedType
        }
        return nil
    }

    private static func allows(_ mimeType: String, in allowed: [String]) -> Bool {
        let type = mimeType.lowercased()
        return allowed.contains { pattern in
            let pattern = pattern.lowercased()
            guard pattern.hasSuffix("/*") else { return pattern == type }
            return type.hasPrefix(String(pattern.dropLast()))
        }
    }
}

/// Why an upload is refused before it is sent.
public enum InventoryDocumentUploadRefusal: Hashable, Sendable {
    case tooLarge(maxUploadBytes: Int)
    case unsupportedType
}

/// Everything the item page's documents section reads in one answer.
public struct InventoryItemDocuments: Codable, Hashable, Sendable {
    public let limits: InventoryDocumentUploadLimits
    public let linked: [InventoryLinkedDocument]
    public let pending: [InventoryDocumentIngestion]
    public let failed: [InventoryDocumentIngestion]

    public init(
        limits: InventoryDocumentUploadLimits, linked: [InventoryLinkedDocument],
        pending: [InventoryDocumentIngestion], failed: [InventoryDocumentIngestion]
    ) {
        self.limits = limits
        self.linked = linked
        self.pending = pending
        self.failed = failed
    }

    public var isEmpty: Bool { linked.isEmpty && pending.isEmpty && failed.isEmpty }
}

/// The fields a document edit changes. A key left `nil` is not sent, so a
/// rename never rewrites the kind and the reverse.
public struct InventoryDocumentEdit: Hashable, Sendable {
    public let kind: InventoryDocumentKind?
    public let title: String?

    public init(kind: InventoryDocumentKind? = nil, title: String? = nil) {
        self.kind = kind
        self.title = title
    }

    /// The edit that takes `document` to `kind` and `title`, holding only the
    /// keys that differ, or `nil` when nothing does. A title is trimmed and
    /// capped at Paperless's 128 characters; a blank one is no change, since
    /// the route cannot clear a title.
    public static func changes(
        to document: InventoryLinkedDocument, kind: InventoryDocumentKind, title: String
    ) -> InventoryDocumentEdit? {
        let trimmed = String(
            title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(titleLimit))
        let newTitle = trimmed.isEmpty || trimmed == document.title ? nil : trimmed
        let newKind = kind == document.kind ? nil : kind
        guard newTitle != nil || newKind != nil else { return nil }
        return InventoryDocumentEdit(kind: newKind, title: newTitle)
    }

    /// Paperless's own title limit, which a rename is synced to.
    public static let titleLimit = 128
}

/// A file on this device, ready to stream to an item.
public struct InventoryDocumentUpload: Hashable, Sendable {
    /// A file this app owns; the upload reads it from disk, never into memory.
    public let fileURL: URL
    public let mimeType: String
    public let fileName: String
    public let byteCount: Int
    public let kind: InventoryDocumentKind
    /// Sent only when it holds more than whitespace.
    public let title: String?

    public init(
        fileURL: URL, mimeType: String, fileName: String, byteCount: Int,
        kind: InventoryDocumentKind, title: String?
    ) {
        self.fileURL = fileURL
        self.mimeType = mimeType
        self.fileName = fileName
        self.byteCount = byteCount
        self.kind = kind
        let trimmed = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.title = trimmed.isEmpty ? nil : trimmed
    }
}

/// What the server currently holds for a linked document's file, read from
/// the headers of a one-byte range request.
public struct InventoryDocumentFileVersion: Hashable, Sendable {
    public let byteCount: Int
    public let contentType: String?
    /// From `Content-Disposition`, when the server named the file.
    public let fileName: String?

    public init(byteCount: Int, contentType: String?, fileName: String?) {
        self.byteCount = byteCount
        self.contentType = contentType
        self.fileName = fileName
    }
}

/// Why a documents call did not answer.
public enum InventoryDocumentsError: Error, Hashable, Sendable {
    /// Paperless is not connected to the documents pillar (`412`).
    case paperlessNotConnected
    /// The documents path is down right now (`502`/`503`).
    case unavailable
    /// The phone could not reach the server.
    case offline
    /// The item, link or upload no longer exists.
    case notFound
    /// Over the documents pillar's size cap (`413`).
    case tooLarge
    /// A file type the documents pillar does not take (`415`).
    case unsupportedType
    /// The server refused the request and said why, in words fit to show.
    case refused(String)
    /// The file is not on this phone and there is no connection to fetch it.
    case needsConnection
}

/// Reads and edits an item's Paperless documents online, through bfm's
/// `/mobile/inventory` document routes. Documents are not in the sync
/// protocol, so this is a seam of its own, like ``InventoryPartsService``.
public protocol InventoryDocumentsService: Sendable {
    /// - Throws: ``InventoryDocumentsError``, or a `RepositoryError` for a
    ///   transport or contract failure.
    func documents(of itemId: InventoryItem.ID) async throws -> InventoryItemDocuments

    /// Sends only the keys `edit` holds.
    func updateDocument(_ id: InventoryLinkedDocument.ID, _ edit: InventoryDocumentEdit)
        async throws

    /// Removes the link; Paperless keeps the document.
    func unlinkDocument(_ id: InventoryLinkedDocument.ID) async throws

    func dismissIngestion(_ id: InventoryDocumentIngestion.ID) async throws

    /// Streams `upload.fileURL` to the item and answers the pending row it became.
    func upload(_ upload: InventoryDocumentUpload, to itemId: InventoryItem.ID) async throws
        -> InventoryDocumentIngestion

    /// What the server holds for the file now, without downloading it.
    func fileVersion(of id: InventoryLinkedDocument.ID) async throws
        -> InventoryDocumentFileVersion

    /// Downloads the whole file to a temporary location the caller moves.
    func downloadFile(of id: InventoryLinkedDocument.ID) async throws -> (
        temporaryURL: URL, version: InventoryDocumentFileVersion
    )
}
