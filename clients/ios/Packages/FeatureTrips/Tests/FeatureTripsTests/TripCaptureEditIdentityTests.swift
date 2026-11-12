import AppCore
import Testing

@testable import FeatureTrips

@Suite("Capture composer edit identity")
@MainActor
internal struct TripCaptureEditIdentityTests {
    @Test("returning to identical text remains a newer draft", arguments: [false, true])
    internal func editABA(recreateBeforeRetry: Bool) async throws {
        let storage = CaptureTestStore()
        let writer = StoredCaptureWriter(storage: storage)
        let initial = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        initial.input.originalText = "Submitted"
        let active: TripCaptureDraft
        if recreateBeforeRetry {
            await initial.submit()
            initial.input.originalText = "New"
            initial.input.originalText = "Submitted"
            active = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        } else {
            active = initial
        }
        writer.paused = true
        let request = Task {
            if recreateBeforeRetry { await active.retry() } else { await active.submit() }
        }
        var arrivals = writer.arrivals.makeAsyncIterator()
        let operation = try #require(await arrivals.next())
        if !recreateBeforeRetry {
            active.input.originalText = "New"
            active.input.originalText = "Submitted"
        }
        #expect(active.input == operation.command.input)
        writer.finish(operation)
        await request.value
        #expect(active.pending == nil)
        #expect(active.result?.receipt.operationId == operation.operationId)
        #expect(active.input.originalText == "Submitted")
        let restored = TripCaptureDraft(tripID: 7, writer: writer, storage: storage)
        #expect(restored.input.originalText == "Submitted")
        #expect(restored.pending == nil)
        #expect(restored.result?.receipt.operationId == operation.operationId)
        #expect(writer.operations.count == (recreateBeforeRetry ? 2 : 1))
    }
}
