import Foundation

/// Owns a transient preview file and removes it when released; it is not a persistent offline cache.
public final class DocumentPreviewFile: Sendable {
    public let url: URL
    private let directory: URL

    /// Moves an actual completed download into an owned directory with its safe response-header name.
    /// Unknown file types remain unknown; source titles are never used to infer MIME type.
    public init(download: DownloadedDocument, id: Int) throws {
        guard id > 0, download.temporaryURL.isFileURL,
            try download.temporaryURL.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile
                == true
        else { throw RepositoryError.contractMismatch }
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        let destination = directory.appending(
            path: DocumentFileName.name(for: download.metadata, id: id))
        do {
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true)
            try FileManager.default.moveItem(at: download.temporaryURL, to: destination)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
        self.directory = directory
        url = destination
    }

    deinit { try? FileManager.default.removeItem(at: directory) }
}
