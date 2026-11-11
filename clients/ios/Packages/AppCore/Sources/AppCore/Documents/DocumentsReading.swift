/// Reads Documents originals by their owner IDs; association/link IDs are never accepted as substitutes.
public protocol DocumentsReading: Sendable {
    /// Returns nil only when the owner reports that the original is missing.
    /// Service configuration, authorization and transport failures remain errors.
    func document(id: Int) async throws -> DocumentOriginal?

    /// Downloads the original file to a caller-owned temporary location.
    /// A metadata response or association never establishes file or offline availability.
    func file(id: Int) async throws -> DownloadedDocument
}

/// Resource-specific read failures; shared transport and authorization failures use RepositoryError.
public enum DocumentAccessError: Error, Hashable, Sendable {
    /// The requested original no longer exists.
    case notFound
    /// The Documents owner has no configured Paperless connection.
    case notConfigured
}
