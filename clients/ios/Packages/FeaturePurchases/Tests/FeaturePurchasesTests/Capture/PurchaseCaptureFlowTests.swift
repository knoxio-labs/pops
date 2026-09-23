import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase capture flow")
internal struct PurchaseCaptureFlowTests {
    @Test("hand entry opens without staging")
    func handEntryStart() {
        let context = makeContext()

        context.flow.start(.hand)

        #expect(context.flow.sheet == .handEntry)
        #expect(context.flow.handEntry != nil)
        #expect(context.flow.staging == nil)
        #expect(context.flow.path.isEmpty)
    }

    @Test("a second start while active changes nothing")
    func activeStartIsIgnored() throws {
        let context = makeContext()
        context.flow.start(.scan)
        let staging = try #require(context.flow.staging)

        context.flow.start(.hand)

        #expect(context.flow.sheet == .batch)
        #expect(context.flow.staging === staging)
        #expect(context.flow.handEntry == nil)
        #expect(context.invalid.messages.isEmpty)
    }

    @Test("reading empty staging reports an invalid transition and stays put")
    func emptyReadIsNoOp() {
        let context = makeContext()
        context.flow.start(.photos)

        context.flow.read()

        #expect(context.flow.path.isEmpty)
        #expect(context.flow.reading == nil)
        #expect(context.invalid.messages.count == 1)
    }

    @Test("review before reading finishes reports an invalid transition")
    func earlyReviewIsNoOp() throws {
        let context = makeContext()
        context.flow.start(.file)
        try #require(context.flow.staging).addScanned([.fake()], pageCount: 1)
        context.flow.read()

        context.flow.review(rows: [])

        #expect(context.flow.path == [.reading])
        #expect(context.flow.review == nil)
        #expect(context.invalid.messages.count == 1)
    }

    @Test("review derives unreadable-first entries from finished rows")
    func unreadableReviewOrder() async throws {
        let context = makeContext()
        try await startFinishedReading(context.flow)
        let read = Self.row(id: "read", outcome: .read(Self.reading))
        let unreadable = Self.row(id: "unreadable", outcome: .unreadable(reason: "blank"))

        context.flow.review(rows: [read, unreadable])

        #expect(context.flow.path == [.reading, .review])
        #expect(context.flow.review?.entries.map(\.id) == ["unreadable", "read"])
    }

    @Test("finishing three saves reports once and resets before callback")
    func finishReportsOnce() {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        context.flow.start(.hand)

        context.flow.finish(savedIDs: ["one", "two", "three"])
        context.flow.finish(savedIDs: ["duplicate"])

        #expect(callbacks == [["one", "two", "three"]])
        expectReset(context.flow)
    }

    @Test("finishing an empty run resets without reporting")
    func emptyFinishDoesNotReport() {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        context.flow.start(.hand)

        context.flow.finish(savedIDs: [])

        #expect(callbacks.isEmpty)
        expectReset(context.flow)
    }

    @Test("cancelling review reports purchases saved before the failure")
    func cancelReportsPartialReview() async throws {
        let repository = FlowRepository(saveResults: [
            .success(.fake(id: "first")),
            .success(.fake(id: "second")),
            .failure(.unavailable),
        ])
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(repository: repository, onSaved: { callbacks.append($0) })
        try await startFinishedReading(context.flow, receiptCount: 3)
        context.flow.review(rows: try #require(context.flow.reading).rows)

        await context.flow.review?.save()
        context.flow.cancel()

        #expect(callbacks == [["first", "second"]])
        expectReset(context.flow)
    }

    @Test("cancelling reading reports nothing and clears every model")
    func cancelReadingResets() throws {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        context.flow.start(.scan)
        try #require(context.flow.staging).addScanned([.fake()], pageCount: 1)
        context.flow.read()

        context.flow.cancel()

        #expect(callbacks.isEmpty)
        expectReset(context.flow)
    }

    private func makeContext(
        repository: FlowRepository = FlowRepository(),
        onSaved: @escaping ([Purchase.ID]) -> Void = { _ in }
    ) -> FlowContext {
        let invalid = InvalidTransitions()
        let flow = PurchaseCaptureFlow(
            dependencies: .fake(receiptCapture: repository),
            onSaved: onSaved,
            reportInvalidTransition: { invalid.messages.append($0) })
        return FlowContext(flow: flow, invalid: invalid)
    }

    private func startFinishedReading(
        _ flow: PurchaseCaptureFlow,
        receiptCount: Int = 1
    ) async throws {
        flow.start(.scan)
        let staging = try #require(flow.staging)
        for value in 1...receiptCount {
            staging.addScanned([.fake(data: Data([UInt8(value)]))], pageCount: 1)
        }
        flow.read()
        await flow.reading?.start()
        #expect(flow.reading?.isFinished == true)
    }

    private func expectReset(_ flow: PurchaseCaptureFlow) {
        #expect(flow.sheet == nil)
        #expect(flow.path.isEmpty)
        #expect(flow.staging == nil)
        #expect(flow.reading == nil)
        #expect(flow.review == nil)
        #expect(flow.handEntry == nil)
    }

    private static func row(
        id: String,
        outcome: PurchaseReadingRow.Outcome
    ) -> PurchaseReadingRow {
        PurchaseReadingRow(id: id, parts: [.fake()], outcome: outcome)
    }

    nonisolated fileprivate static let reading = ReceiptDraftReading(
        receiptUris: ["pops://purchases/receipt/test"],
        reconciled: true,
        failures: [],
        extracted: .fake(),
        capture: nil,
        matchedMerchantEntityID: "merchant-1")
}

@MainActor
private final class InvalidTransitions {
    fileprivate var messages: [String] = []
}

private struct FlowContext {
    let flow: PurchaseCaptureFlow
    let invalid: InvalidTransitions
}

private actor FlowRepository: ReceiptCaptureRepository {
    private let saveResults: [Result<ReceiptPurchase, RepositoryError>]
    private var saveCount = 0

    fileprivate init(saveResults: [Result<ReceiptPurchase, RepositoryError>] = []) {
        self.saveResults = saveResults
    }

    fileprivate func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        .draft(PurchaseCaptureFlowTests.reading)
    }

    fileprivate func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        defer { saveCount += 1 }
        guard saveResults.indices.contains(saveCount) else {
            throw RepositoryError.transport("save script exhausted")
        }
        return try saveResults[saveCount].get()
    }

    fileprivate func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        throw RepositoryError.dependencyNotBound
    }
}
