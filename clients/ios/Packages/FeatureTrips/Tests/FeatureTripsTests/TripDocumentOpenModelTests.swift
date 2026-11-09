import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Actual document previews")
@MainActor
internal struct TripDocumentOpenModelTests {
    @Test("only an actual file becomes a preview and dismissal removes the transient copy")
    internal func actualFile() async throws {
        let source = try TripDocumentTestFile("actual original")
        let reader = DeferredDocumentsReader()
        let model = TripDocumentOpenModel(repository: reader)
        let task = Task { await model.open(id: 99) }
        await reader.waitFor(99)
        #expect(model.preview == nil)
        await reader.complete(99, result: .success(source.download))
        await task.value
        let preview = try #require(model.preview)
        #expect(preview.lastPathComponent == "Ticket.pdf")
        #expect(try Data(contentsOf: preview) == Data("actual original".utf8))
        #expect(!FileManager.default.fileExists(atPath: source.download.temporaryURL.path()))
        model.preview = nil
        model.dismissPreview()
        #expect(!FileManager.default.fileExists(atPath: preview.path()))
        #expect(model.failure == nil)
    }

    @Test("closing while a file loads discards its late result without claiming availability")
    internal func lateClosedFile() async throws {
        let source = try TripDocumentTestFile("late")
        let reader = DeferredDocumentsReader()
        let model = TripDocumentOpenModel(repository: reader)
        let task = Task { await model.open(id: 99) }
        await reader.waitFor(99)
        model.close()
        await reader.complete(99, result: .success(source.download))
        await task.value
        #expect(model.preview == nil)
        #expect(!model.opening)
        #expect(!FileManager.default.fileExists(atPath: source.download.temporaryURL.path()))
    }

    @Test("another original cannot be overwritten by a late response for the previous ID")
    internal func sourceRace() async throws {
        let first = try TripDocumentTestFile("first")
        let second = try TripDocumentTestFile("second")
        let reader = DeferredDocumentsReader()
        let model = TripDocumentOpenModel(repository: reader)
        let one = Task { await model.open(id: 1) }
        await reader.waitFor(1)
        let two = Task { await model.open(id: 2) }
        await reader.waitFor(2)
        await reader.complete(2, result: .success(second.download))
        await two.value
        await reader.complete(1, result: .success(first.download))
        await one.value
        let preview = try #require(model.preview)
        #expect(try Data(contentsOf: preview) == Data("second".utf8))
        #expect(!FileManager.default.fileExists(atPath: first.download.temporaryURL.path()))
        model.close()
        #expect(!FileManager.default.fileExists(atPath: preview.path()))
    }

    @Test(
        "a failed different original clears the previous file and a successful retry clears its error"
    )
    internal func refusalAndRetry() async throws {
        let first = try TripDocumentTestFile("first")
        let second = try TripDocumentTestFile("second")
        let reader = DeferredDocumentsReader()
        let model = TripDocumentOpenModel(repository: reader)
        let one = Task { await model.open(id: 1) }
        await reader.waitFor(1)
        await reader.complete(1, result: .success(first.download))
        await one.value
        let old = try #require(model.preview)
        let refusal = Task { await model.open(id: 2) }
        await reader.waitFor(2)
        #expect(model.preview == nil)
        #expect(!FileManager.default.fileExists(atPath: old.path()))
        await reader.complete(2, result: .failure(DocumentAccessError.notConfigured))
        await refusal.value
        #expect(model.failure as? DocumentAccessError == .notConfigured)
        let retry = Task { await model.open(id: 2) }
        await reader.waitFor(2)
        await reader.complete(2, result: .success(second.download))
        await retry.value
        #expect(model.failure == nil)
        #expect(model.preview != nil)
        model.close()
    }

    @Test("cancelled loads clean up completed bytes and stop loading without presenting an error")
    internal func cancellation() async throws {
        let source = try TripDocumentTestFile("cancelled")
        let reader = DeferredDocumentsReader()
        let model = TripDocumentOpenModel(repository: reader)
        let task = Task { await model.open(id: 1) }
        await reader.waitFor(1)
        task.cancel()
        await reader.complete(1, result: .success(source.download))
        await task.value
        #expect(model.preview == nil)
        #expect(model.failure == nil)
        #expect(!model.opening)
        #expect(!FileManager.default.fileExists(atPath: source.download.temporaryURL.path()))
    }
}

private actor DeferredDocumentsReader: DocumentsReading {
    private var pending: [Int: CheckedContinuation<DownloadedDocument, any Error>] = [:]
    private var waiters: [Int: [CheckedContinuation<Void, Never>]] = [:]

    internal func document(id: Int) async throws -> DocumentOriginal? { nil }

    internal func file(id: Int) async throws -> DownloadedDocument {
        try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            for waiter in waiters.removeValue(forKey: id) ?? [] { waiter.resume() }
        }
    }

    internal func waitFor(_ id: Int) async {
        if pending[id] != nil { return }
        await withCheckedContinuation { waiters[id, default: []].append($0) }
    }

    internal func complete(_ id: Int, result: Result<DownloadedDocument, any Error>) {
        pending.removeValue(forKey: id)?.resume(with: result)
    }
}
