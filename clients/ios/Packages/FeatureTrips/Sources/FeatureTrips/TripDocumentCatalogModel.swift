import AppCore
import Foundation
import Observation

internal enum TripDocumentLoadState {
    case loading
    case available(DocumentOriginal)
    case missing
    case failed(any Error)
}

@MainActor
@Observable
internal final class TripDocumentCatalogModel {
    internal private(set) var states: [Int: TripDocumentLoadState] = [:]
    private let repository: any DocumentsReading
    private var request = UUID()

    internal init(repository: any DocumentsReading) { self.repository = repository }

    internal func load(_ ids: [Int]) async {
        let token = UUID()
        request = token
        var seen: Set<Int> = []
        let originals = ids.filter { seen.insert($0).inserted }
        states = Dictionary(uniqueKeysWithValues: originals.map { ($0, .loading) })
        for id in originals {
            do {
                let value = try await repository.document(id: id)
                guard request == token, !Task.isCancelled else { return }
                if let value {
                    guard value.id == id else { throw RepositoryError.contractMismatch }
                    states[id] = .available(value)
                } else {
                    states[id] = .missing
                }
            } catch {
                guard request == token, !Task.isCancelled else { return }
                states[id] = .failed(error)
            }
        }
    }
}

internal func tripDocumentTitle(_ document: DocumentOriginal) -> String {
    if !document.title.isEmpty { return document.title }
    if !document.originalFileName.isEmpty { return document.originalFileName }
    return "Document \(document.id)"
}
