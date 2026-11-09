import Foundation

/// An actual completed file download. The caller owns and must remove its temporary file.
public struct DownloadedDocument: Sendable {
    public let temporaryURL: URL
    public let metadata: DocumentFileMetadata

    /// Wraps the completed transfer, not an inferred download or persistent offline copy.
    public init(temporaryURL: URL, metadata: DocumentFileMetadata) {
        self.temporaryURL = temporaryURL
        self.metadata = metadata
    }
}
