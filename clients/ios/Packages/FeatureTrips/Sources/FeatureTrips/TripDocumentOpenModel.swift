import AppCore
import Foundation
import Observation

@MainActor
@Observable
internal final class TripDocumentOpenModel {
    internal var preview: URL?
    internal private(set) var opening = false
    internal private(set) var failure: (any Error)?
    private let repository: any DocumentsReading
    private var file: DocumentPreviewFile?
    private var request = UUID()

    internal init(repository: any DocumentsReading) { self.repository = repository }

    internal func open(id: Int) async {
        let token = UUID()
        request = token
        opening = true
        failure = nil
        preview = nil
        file = nil
        do {
            let downloaded = try await repository.file(id: id)
            guard request == token, !Task.isCancelled else {
                try? FileManager.default.removeItem(at: downloaded.temporaryURL)
                if request == token { opening = false }
                return
            }
            do { file = try DocumentPreviewFile(download: downloaded, id: id) } catch {
                try? FileManager.default.removeItem(at: downloaded.temporaryURL)
                throw error
            }
            preview = file?.url
            opening = false
        } catch {
            guard request == token else { return }
            if !(error is CancellationError) { failure = error }
            opening = false
        }
    }

    internal func close() {
        request = UUID()
        preview = nil
        file = nil
        opening = false
        failure = nil
    }

    internal func dismissPreview() {
        if preview == nil { file = nil }
    }
}
