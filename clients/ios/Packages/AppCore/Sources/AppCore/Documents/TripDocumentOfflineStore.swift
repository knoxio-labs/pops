import Foundation

/// Exact pairing namespace for retained Trip reads. Token rotation does not change its pairing revision.
public struct TripDocumentOfflineOwner: Codable, Hashable, Sendable {
    public let baseURL: URL
    public let deviceID: String
    public let credentialRevision: UInt64

    /// Captures identity only; no credentials or signing material enter a persisted record.
    public init(device: PairedDevice) {
        baseURL = device.baseURL
        deviceID = device.id
        credentialRevision = device.credentialRevision
    }
}

/// A complete successful catalogue read with the instant the remote response was verified.
public struct VerifiedTripCatalogue: Codable, Hashable, Sendable {
    public let trips: [TripRecord]
    public let verifiedAt: Date

    /// Does not assert that this last-good read is still current on the server.
    public init(trips: [TripRecord], verifiedAt: Date) {
        self.trips = trips
        self.verifiedAt = verifiedAt
    }
}

/// A faithful complete source response; associations never prove that original bytes were downloaded.
public struct VerifiedTripSnapshot: Codable, Hashable, Sendable {
    public let snapshot: TripSnapshot
    public let verifiedAt: Date

    /// Retains the owning source order and identities without deriving additional relationships.
    public init(snapshot: TripSnapshot, verifiedAt: Date) {
        self.snapshot = snapshot
        self.verifiedAt = verifiedAt
    }
}

/// Last verified Documents metadata, independent of local original availability.
public struct VerifiedDocumentOriginal: Codable, Hashable, Sendable {
    public let original: DocumentOriginal
    public let verifiedAt: Date

    /// Metadata alone never creates a retained file record.
    public init(original: DocumentOriginal, verifiedAt: Date) {
        self.original = original
        self.verifiedAt = verifiedAt
    }
}

/// Last-good navigation records and an explicit local selection, not a remotely current aggregate.
public struct TripDocumentOfflineNavigation: Codable, Hashable, Sendable {
    public let owner: TripDocumentOfflineOwner
    public let generation: UUID
    public let catalogue: VerifiedTripCatalogue?
    public let trips: [VerifiedTripSnapshot]
    public let originals: [VerifiedDocumentOriginal]
    public let selectedTripID: Int?

    /// A replacement is committed atomically; failed or partial network reads must not be supplied as empty success.
    public init(
        owner: TripDocumentOfflineOwner, generation: UUID = UUID(),
        catalogue: VerifiedTripCatalogue?,
        trips: [VerifiedTripSnapshot], originals: [VerifiedDocumentOriginal], selectedTripID: Int?
    ) {
        self.owner = owner
        self.generation = generation
        self.catalogue = catalogue
        self.trips = trips
        self.originals = originals
        self.selectedTripID = selectedTripID
    }
}

/// A completed retained original. Its digest proves local integrity, not remote freshness or association membership.
public struct TripOfflineFileRecord: Codable, Hashable, Sendable {
    public let owner: TripDocumentOfflineOwner
    public let documentID: Int
    public let generation: UUID
    public let verifiedAt: Date
    public let byteCount: Int
    public let sha256: String
    public let contentType: String?
    public let fileName: String?
    public let responseByteCount: Int?

    /// Records actual completed-transfer metadata and a locally measured file digest.
    public init(
        owner: TripDocumentOfflineOwner, documentID: Int, generation: UUID,
        verifiedAt: Date, byteCount: Int, sha256: String, metadata: DocumentFileMetadata
    ) {
        self.owner = owner
        self.documentID = documentID
        self.generation = generation
        self.verifiedAt = verifiedAt
        self.byteCount = byteCount
        self.sha256 = sha256
        contentType = metadata.contentType
        fileName = metadata.fileName
        responseByteCount = metadata.byteCount
    }

    /// Preserves unknown response headers instead of filling them from filenames or local measurements.
    public var metadata: DocumentFileMetadata {
        DocumentFileMetadata(
            byteCount: responseByteCount, contentType: contentType, fileName: fileName)
    }
}

/// Local failures never mean that the remote original is missing or that an empty source read succeeded.
public enum TripDocumentOfflineError: Error, Hashable, Sendable {
    case ownerChanged
    case generationChanged
    case invalidRecord
    case corruptOriginal
}

/// Technical persistence only. No method starts network work, infers associations,
/// replays writes or authorizes a fallback.
@MainActor
public protocol TripDocumentOfflineStore {
    /// Immutable captured identity checked at each disk operation.
    var owner: TripDocumentOfflineOwner { get }
    /// Nil means no navigation record exists, not unreadable or malformed storage.
    func loadNavigation() throws -> TripDocumentOfflineNavigation?
    /// Replaces exactly the expected generation; nil requires an absent record.
    func replaceNavigation(_ value: TripDocumentOfflineNavigation, replacing generation: UUID?)
        throws
    /// Returns a manifest only after validating its retained bytes; nil means no committed original.
    func original(id: Int) throws -> TripOfflineFileRecord?
    /// Commits completed bytes before publishing their manifest; the caller still owns the input temporary file.
    func retainOriginal(
        _ download: DownloadedDocument, id: Int, verifiedAt: Date, replacing generation: UUID?
    ) throws -> TripOfflineFileRecord
    /// Supplies a disposable copy; preview dismissal must never remove the durable original.
    func previewOriginal(id: Int) throws -> DownloadedDocument?
}
