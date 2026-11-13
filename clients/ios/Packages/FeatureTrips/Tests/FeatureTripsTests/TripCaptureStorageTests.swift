import AppCore
import Testing

@testable import FeatureTrips

@Suite("Durable capture command lifecycle")
@MainActor
internal struct TripCaptureStorageTests {
    @Test(
        "recreating the session restores unsent fields and the exact uncertain command without sending"
    )
    internal func restart() async throws {
        let storage = CaptureTestStore()
        let writer = StoredCaptureWriter(storage: storage)
        let first = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        first.input.originalText = "  unsent original\n"
        first.input.originalUrl = "https://source.example/original"
        let unsent = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(unsent.input == first.input)
        #expect(writer.operations.isEmpty)
        await first.submit()
        let operation = try #require(first.pending)
        let restarted = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(restarted.input == first.input)
        #expect(restarted.pending == operation)
        #expect(writer.operations == [operation])
        writer.succeeds = true
        await restarted.retry()
        #expect(writer.operations == [operation, operation])
        let completed = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(completed.pending == nil)
        #expect(completed.result?.receipt.operationId == operation.operationId)
        #expect(completed.receipts[operation.operationId] == completed.result)
    }

    @Test(
        "storage failure prevents dispatch and preserves the allocated UUID for explicit recovery")
    internal func failedPersistence() async throws {
        let storage = CaptureTestStore()
        let writer = StoredCaptureWriter(storage: storage)
        let draft = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        draft.input.originalText = "Keep locally"
        storage.fails = true
        await draft.submit()
        let operation = try #require(draft.pending)
        #expect(writer.operations.isEmpty)
        #expect(draft.storageFailure == .unavailable)
        storage.fails = false
        draft.retryStorage()
        #expect(writer.operations.isEmpty)
        await draft.retry()
        #expect(writer.operations == [operation])
    }

    @Test("new text entered during a save survives the matching receipt and session recreation")
    internal func newerText() async throws {
        let storage = CaptureTestStore()
        let writer = StoredCaptureWriter(storage: storage)
        writer.paused = true
        let draft = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        draft.input.originalText = "Submitted original"
        let save = Task { await draft.submit() }
        var arrivals = writer.arrivals.makeAsyncIterator()
        let operation = try #require(await arrivals.next())
        draft.input.originalText = "New unsent original"
        writer.finish(operation)
        await save.value
        let restarted = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(restarted.pending == nil)
        #expect(restarted.input.originalText == "New unsent original")
        #expect(restarted.result?.receipt.operationId == operation.operationId)
    }

    @Test("a late receipt cannot overwrite a newer persisted draft generation")
    internal func laterGeneration() async throws {
        let storage = CaptureTestStore()
        let writer = StoredCaptureWriter(storage: storage)
        writer.paused = true
        let first = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        first.input.originalText = "Submitted original"
        let save = Task { await first.submit() }
        var arrivals = writer.arrivals.makeAsyncIterator()
        let operation = try #require(await arrivals.next())
        let newer = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        newer.input.originalText = "New generation"
        writer.finish(operation)
        await save.value
        #expect(first.storageFailure == .generationChanged)
        let restarted = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(restarted.input.originalText == "New generation")
        #expect(restarted.pending == operation)
    }

    @Test("a changed owner or unreadable record never becomes an empty writable draft")
    internal func failedLoad() async {
        let storage = CaptureTestStore()
        storage.fails = true
        let writer = StoredCaptureWriter(storage: storage)
        let draft = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(!draft.canEdit)
        draft.input.originalText = "Must not overwrite unknown disk state"
        await draft.submit()
        #expect(writer.operations.isEmpty)
        #expect(draft.storageFailure == .unavailable)
    }
}
