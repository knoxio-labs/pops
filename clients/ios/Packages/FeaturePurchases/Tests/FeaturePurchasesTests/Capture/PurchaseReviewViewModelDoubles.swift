import AppCore
import AppCoreFakes
import Foundation
import Synchronization
import Testing

@testable import FeaturePurchases

internal final class KeySequence: Sendable {
    private let count = Mutex(0)

    internal func next() -> String {
        count.withLock { value in
            value += 1
            return "key-\(value)"
        }
    }
}

internal actor ReviewWriteRepository: ReceiptCaptureRepository {
    internal enum Route: Equatable, Sendable {
        case draft
        case manual
    }

    internal private(set) var routes: [Route] = []
    internal private(set) var savedDrafts: [ReceiptDraftSavePayload] = []

    private let results: [Result<ReceiptPurchase, RepositoryError>]
    private let gated: Set<Int>
    private let cancelled: Set<Int>
    private var held: [CheckedContinuation<Void, Never>] = []
    private var waiters: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

    internal init(
        results: [Result<ReceiptPurchase, RepositoryError>] = [],
        gating: Set<Int> = [],
        cancelling: Set<Int> = []
    ) {
        self.results = results
        gated = gating
        cancelled = cancelling
    }

    internal func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        throw RepositoryError.transport("extract is not part of review")
    }

    internal func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        savedDrafts.append(payload)
        return try await answer(route: .draft)
    }

    internal func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        return try await answer(route: .manual)
    }

    internal func waitForCallCount(_ count: Int) async {
        guard routes.count < count else { return }
        await withCheckedContinuation { waiters.append((count, $0)) }
    }

    internal func release() {
        for continuation in held { continuation.resume() }
        held = []
    }

    private func answer(route: Route) async throws -> ReceiptPurchase {
        routes.append(route)
        let call = routes.count
        let reached = waiters.filter { $0.count <= call }
        waiters.removeAll { $0.count <= call }
        for waiter in reached { waiter.continuation.resume() }
        if gated.contains(call) {
            await withCheckedContinuation { held.append($0) }
        }
        if cancelled.contains(call) { throw CancellationError() }
        guard results.indices.contains(call - 1) else {
            throw RepositoryError.transport("write script exhausted")
        }
        return try results[call - 1].get()
    }
}

extension PurchaseReviewViewModelTests {
    func makeModel(
        _ entries: [ReviewEntry],
        repository: ReviewWriteRepository,
        keys: KeySequence = KeySequence()
    ) -> PurchaseReviewViewModel {
        PurchaseReviewViewModel(
            entries: entries, repository: repository, makeIdempotencyKey: keys.next)
    }

    func entry(
        id: String,
        origin: ReviewOrigin = .read,
        flagged: Bool = false,
        saveable: Bool = true
    ) -> ReviewEntry {
        let reading = ReceiptDraftReading(
            receiptUris: ["pops://purchases/receipt/\(id)"],
            reconciled: !flagged,
            failures: flagged ? [.fake()] : [],
            extracted: .fake(),
            capture: nil,
            matchedMerchantEntityID: "merchant-1")
        var draft = ReceiptDraftPresentation().draft(
            extracted: reading.extracted,
            failures: reading.failures,
            matchedMerchantID: reading.matchedMerchantEntityID)
        if !saveable { draft.total.value = "" }
        return ReviewEntry(
            id: id,
            draft: draft,
            origin: origin,
            reading: origin == .read ? reading : nil,
            status: flagged
                ? ReceiptDraftView.Status(
                    tone: .warning,
                    heading: PurchaseReviewCopy.needsReviewHeading,
                    message: PurchaseReviewCopy.needsReviewMessage)
                : nil,
            parts: [.fake()])
    }
}
