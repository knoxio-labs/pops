import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Canonical capture draft and uncertain delivery")
@MainActor
internal struct TripCaptureDraftTests {
    @Test("empty capture never dispatches and verbatim material survives an unavailable save")
    internal func failedSave() async {
        let writer = CaptureWriter()
        var accepted: [Int] = []
        let model = TripCaptureDraft(tripID: 7, writer: writer) { accepted.append($0) }
        await model.submit()
        #expect(await writer.operations.isEmpty)
        model.input.originalText = "  original source\n"
        await model.submit()
        #expect(model.input.originalText == "  original source\n")
        #expect(model.pending != nil)
        #expect(model.failure == .unavailable)
        #expect(!model.saving)
        #expect(await writer.operations.count == 1)
        #expect(accepted.isEmpty)
    }

    @Test("retry is explicit and reuses the entire original operation with its UUID")
    internal func exactRetry() async throws {
        let writer = CaptureWriter()
        var accepted: [Int] = []
        let model = TripCaptureDraft(tripID: 7, writer: writer) { accepted.append($0) }
        model.input.originalText = "Saved source"
        await model.submit()
        let pending = try #require(model.pending)
        await model.submit()
        #expect(await writer.operations.count == 1)
        await writer.succeed()
        await model.retry()
        #expect(await writer.operations == [pending, pending])
        #expect(model.pending == nil)
        #expect(model.result?.receipt.operationId == pending.operationId)
        #expect(model.input.originalText.isEmpty)
        await model.retry()
        #expect(accepted == [7])
    }

    @Test(
        "closing, reopening and changing selected Trip preserve each own draft and uncertain operation"
    )
    internal func retainedPerTrip() async {
        let writer = CaptureWriter()
        let drafts = TripCaptureDrafts(writer: writer)
        let first = drafts.draft(tripID: 7)
        first.input.originalText = "A original"
        await first.submit()
        let second = drafts.draft(tripID: 8)
        second.input.originalText = "B draft"
        #expect(drafts.draft(tripID: 7) === first)
        #expect(drafts.draft(tripID: 8) === second)
        #expect(first.pending != nil)
        #expect(first.input.originalText == "A original")
        #expect(second.pending == nil)
        #expect(second.input.originalText == "B draft")
    }

    @Test("a different operation receipt cannot clear the retained unknown operation")
    internal func mismatchedReceipt() async {
        let writer = CaptureWriter()
        await writer.returnWrongReceipt()
        var accepted: [Int] = []
        let model = TripCaptureDraft(tripID: 7, writer: writer) { accepted.append($0) }
        model.input.originalText = "Keep this draft"
        await model.submit()
        #expect(model.pending != nil)
        #expect(model.result == nil)
        #expect(model.failure == .contractMismatch)
        #expect(model.input.originalText == "Keep this draft")
        #expect(accepted.isEmpty)
    }

    @Test("an accepted write still notifies after its composer was dismissed")
    internal func acceptedAfterDismissal() async throws {
        let writer = CaptureWriter()
        await writer.succeed()
        let snapshot = try TripTestSources.snapshot()
        let model = TripsModel(repository: CaptureSourceReader(snapshot: snapshot))
        var accepted: [Int] = []
        let drafts = TripCaptureDrafts(writer: writer) { accepted.append($0) }
        let draft = drafts.draft(tripID: snapshot.trip.id)
        draft.input.originalText = "Retained original"
        model.capture = draft
        draft.save()
        model.capture = nil
        await draft.writeTask?.value
        #expect(model.capture == nil)
        #expect(accepted == [snapshot.trip.id])
        #expect(drafts.draft(tripID: snapshot.trip.id) === draft)
    }
}

private struct CaptureSourceReader: TripsReading {
    let snapshot: TripSnapshot
    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? { snapshot }
}

private actor CaptureWriter: TripCapturesWriting {
    private var available = false
    private var wrongReceipt = false
    internal private(set) var operations: [TripCaptureCreateOperation] = []
    internal func succeed() { available = true }
    internal func returnWrongReceipt() {
        available = true
        wrongReceipt = true
    }
    internal func createCapture(tripID: Int, operation: TripCaptureCreateOperation) async throws
        -> TripCaptureOperationResult
    {
        operations.append(operation)
        guard available else { throw RepositoryError.unavailable }
        return TripCaptureOperationResult(
            receipt: TripCaptureReceipt(
                operationID: wrongReceipt ? UUID() : operation.operationId, undoneOperationID: nil,
                captures: []),
            current: TripCaptureWorkspace(captures: []), undone: false, replayed: false)
    }
}
