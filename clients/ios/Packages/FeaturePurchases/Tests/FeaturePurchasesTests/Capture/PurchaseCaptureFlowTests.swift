import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase capture flow")
internal struct PurchaseCaptureFlowTests {
    @Test("hand entry opens without staging")
    func handEntryStart() async {
        let context = makeContext()

        await context.flow.start(.hand)

        #expect(context.flow.sheet == .handEntry)
        #expect(context.flow.handEntry != nil)
        #expect(context.flow.staging == nil)
        #expect(context.flow.path.isEmpty)
    }

    @Test("a second start while active changes nothing")
    func activeStartIsIgnored() async throws {
        let context = makeContext()
        await context.flow.start(.photos)
        let staging = try #require(context.flow.staging)

        await context.flow.start(.hand)

        #expect(context.flow.sheet == nil)
        #expect(context.flow.picker == .photos)
        #expect(context.flow.staging === staging)
        #expect(context.flow.handEntry == nil)
        #expect(context.invalid.messages.isEmpty)
    }

    @Test("reading empty staging reports an invalid transition and stays put")
    func emptyReadIsNoOp() async {
        let context = makeContext()
        await openEmptyBatch(context.flow)

        context.flow.read()

        #expect(context.flow.path.isEmpty)
        #expect(context.flow.reading == nil)
        #expect(context.invalid.messages.count == 1)
    }

    @Test("review before reading finishes reports an invalid transition")
    func earlyReviewIsNoOp() async throws {
        let context = makeContext()
        await openEmptyBatch(context.flow)
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
    func finishReportsOnce() async {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        await context.flow.start(.hand)

        context.flow.finish(savedIDs: ["one", "two", "three"])
        context.flow.finish(savedIDs: ["duplicate"])

        #expect(callbacks == [["one", "two", "three"]])
        expectReset(context.flow)
    }

    @Test("finishing an empty run resets without reporting")
    func emptyFinishDoesNotReport() async {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        await context.flow.start(.hand)

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
    func cancelReadingResets() async throws {
        var callbacks: [[Purchase.ID]] = []
        let context = makeContext(onSaved: { callbacks.append($0) })
        await context.flow.start(.scan)
        context.flow.didScan(parts: [.fake()], pageCount: 1)
        context.flow.pickerDismissed()
        context.flow.read()

        context.flow.cancel()

        #expect(callbacks.isEmpty)
        expectReset(context.flow)
    }

    private func makeContext(
        repository: FlowRepository = FlowRepository(),
        camera: FlowCamera = FlowCamera(.authorized),
        onSaved: @escaping ([Purchase.ID]) -> Void = { _ in }
    ) -> FlowContext {
        let invalid = InvalidTransitions()
        let flow = PurchaseCaptureFlow(
            dependencies: .fake(receiptCapture: repository),
            camera: camera,
            onSaved: onSaved,
            reportInvalidTransition: { invalid.messages.append($0) })
        return FlowContext(flow: flow, invalid: invalid)
    }

    private func startFinishedReading(
        _ flow: PurchaseCaptureFlow,
        receiptCount: Int = 1
    ) async throws {
        await flow.start(.scan)
        for value in 1...receiptCount {
            flow.didScan(parts: [.fake(data: Data([UInt8(value)]))], pageCount: 1)
        }
        flow.pickerDismissed()
        flow.read()
        await flow.reading?.start()
        #expect(flow.reading?.isFinished == true)
    }

    private func openEmptyBatch(_ flow: PurchaseCaptureFlow) async {
        await flow.start(.photos)
        flow.sheet = .batch
        flow.pickerDismissed()
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

private struct FlowCamera: CameraAuthorizing {
    let access: CameraAccess

    init(_ access: CameraAccess) {
        self.access = access
    }

    func currentAccess() -> CameraAccess { access }
    func requestAccess() async -> CameraAccess { access }
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
