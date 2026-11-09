import AppCore
import Foundation

internal final class TripDocumentTestFile: Sendable {
    internal let download: DownloadedDocument
    private let directory: URL

    internal init(_ contents: String) throws {
        var root = URL(filePath: #filePath).deletingLastPathComponent()
        while !FileManager.default.fileExists(atPath: root.appending(path: ".git").path()) {
            let parent = root.deletingLastPathComponent()
            guard parent != root else { throw RepositoryError.contractMismatch }
            root = parent
        }
        directory = root.appending(path: "tmp/trip-document-tests/\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appending(path: "download")
        try Data(contents.utf8).write(to: file)
        download = DownloadedDocument(
            temporaryURL: file,
            metadata: DocumentFileMetadata(
                byteCount: nil, contentType: "application/pdf", fileName: "../../Ticket"))
    }

    deinit { try? FileManager.default.removeItem(at: directory) }
}
