import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase edit model")
@MainActor
internal struct PurchaseEditModelTests {
    @Test("unchanged cancel dismisses without asking")
    func unchangedCancelDismisses() {
        let model = model(EditRepositoryDouble(responses: []))

        #expect(model.requestCancel() == .dismiss)
        #expect(!model.confirmingDiscard)
        #expect(!model.changed)
    }

    @Test("changed cancel asks before discarding and Keep editing preserves the draft")
    func changedCancelConfirms() {
        let model = model(EditRepositoryDouble(responses: []))
        let changed = changedDraft(model)
        model.updateDraft(changed)

        #expect(model.requestCancel() == .confirmDiscard)
        #expect(model.confirmingDiscard)
        model.keepEditing()
        #expect(!model.confirmingDiscard)
        #expect(model.draft == changed)
        #expect(model.opened != changed)
        #expect(model.changed)
    }

    @Test("a transport failure keeps every edit and exposes retry copy")
    func transportFailurePreservesDraft() async {
        let repository = EditRepositoryDouble(responses: [.failure(.transport("offline"))])
        let model = model(repository)
        let changed = changedDraft(model)
        model.updateDraft(changed)

        #expect(await model.save() == nil)
        #expect(model.draft == changed)
        #expect(model.changed)
        #expect(model.failure == .unavailable)
        #expect(model.failure?.message == "No connection. Your changes are still here.")
        #expect(!model.saving)
    }

    @Test("retry sends the same complete update exactly once more")
    func retrySendsSameUpdate() async throws {
        let saved = Self.detail(id: "saved")
        let repository = EditRepositoryDouble(
            responses: [.failure(.unavailable), .value(saved)])
        let model = model(repository)
        model.updateDraft(changedDraft(model))

        #expect(await model.save() == nil)
        #expect(await model.save() == saved)

        let updates = await repository.recordedUpdates
        #expect(updates.count == 2)
        let first = try #require(updates.first)
        let last = try #require(updates.last)
        #expect(first == last)
    }

    @Test("a successful save can complete the sheet only once")
    func successIsOneShot() async {
        let saved = Self.detail(id: "saved")
        let repository = EditRepositoryDouble(responses: [.value(saved)])
        let model = model(repository)
        model.updateDraft(changedDraft(model))
        let completion = EditCompletionRecorder()
        let request = PurchaseEditRequest(detail: Self.detail()) { completion.saved.append($0) }

        for _ in 0..<2 {
            if let updated = await model.save() {
                request.onSaved(updated)
                completion.dismissals += 1
            }
        }

        #expect(completion.saved == [saved])
        #expect(completion.dismissals == 1)
        #expect(await repository.recordedUpdates.count == 1)
        #expect(!model.changed)
    }

    @Test(
        "conflict codes retain their distinct recovery copy",
        arguments: [
            (
                RepositoryError.conflict("purchase_locked"),
                PurchaseEditFailure.purchaseLocked,
                "Merchant, date and total are locked by the bank match"
            ),
            (
                RepositoryError.conflict("purchase_stale"),
                PurchaseEditFailure.purchaseStale,
                "Changed elsewhere. Close and open it again"
            ),
        ])
    func conflictCopy(
        error: RepositoryError,
        expected: PurchaseEditFailure,
        message: String
    ) async {
        let repository = EditRepositoryDouble(responses: [.failure(error)])
        let model = model(repository)
        model.updateDraft(changedDraft(model))

        _ = await model.save()

        #expect(model.failure == expected)
        #expect(model.failure?.message == message)
    }

    @Test("a missing purchase is distinct from a failed request")
    func missingPurchase() async {
        let model = model(EditRepositoryDouble(responses: [.value(nil)]))
        model.updateDraft(changedDraft(model))

        #expect(await model.save() == nil)
        #expect(model.failure == .notFound)
        #expect(model.changed)
    }

    @Test("saving blocks concurrent save and cancel actions")
    func savingIsExclusive() async {
        let gate = EditGate()
        let repository = EditRepositoryDouble(
            responses: [.gated(gate, Self.detail(id: "saved"))])
        let model = model(repository)
        model.updateDraft(changedDraft(model))

        let first = Task { await model.save() }
        await repository.waitForCalls(1)
        #expect(model.saving)
        #expect(model.requestCancel() == .stay)
        #expect(await model.save() == nil)

        await gate.open()
        #expect(await first.value?.id == "saved")
        #expect(!model.saving)
        #expect(await repository.recordedUpdates.count == 1)
    }

    private func model(_ repository: EditRepositoryDouble) -> PurchaseEditModel {
        PurchaseEditModel(
            detail: Self.detail(), dependencies: .fake(purchases: repository))
    }

    private func changedDraft(_ model: PurchaseEditModel) -> ReceiptDraft {
        var draft = model.draft
        draft.lines[0].description.value = "Changed"
        return draft
    }

    private static func detail(id: Purchase.ID = "purchase") -> PurchaseDetail {
        .fake(
            purchase: .fake(
                id: id,
                merchant: .entity(id: "merchant", name: "Bakery", printed: "BAKERY"),
                total: MoneyAmount(minorUnits: 500, currencyCode: "AUD")),
            subtotal: MoneyAmount(minorUnits: 500, currencyCode: "AUD"),
            lines: [
                .fake(
                    id: "line", name: "Bread",
                    lineTotal: MoneyAmount(minorUnits: 500, currencyCode: "AUD"))
            ],
            updatedAt: "opaque-token")
    }
}

@MainActor
private final class EditCompletionRecorder {
    var saved: [PurchaseDetail] = []
    var dismissals = 0
}

private actor EditGate {
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if opened { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        opened = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}

private enum EditResponse: Sendable {
    case value(PurchaseDetail?)
    case failure(RepositoryError)
    case gated(EditGate, PurchaseDetail?)
}

private actor EditRepositoryDouble: PurchasesRepository {
    private var responses: [EditResponse]
    private var updates: [PurchaseUpdate] = []
    private var callWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    init(responses: [EditResponse]) {
        self.responses = responses
    }

    var recordedUpdates: [PurchaseUpdate] { updates }

    func waitForCalls(_ count: Int) async {
        if updates.count >= count { return }
        await withCheckedContinuation { callWaiters.append((count, $0)) }
    }

    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        PurchasePage(purchases: [], nextCursor: nil, totalCount: 0)
    }

    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary { .empty }

    func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? { nil }

    func updatePurchase(
        id: Purchase.ID, _ update: PurchaseUpdate
    ) async throws -> PurchaseDetail? {
        updates.append(update)
        resumeCallWaiters()
        switch responses.removeFirst() {
        case .value(let detail): return detail
        case .failure(let error): throw error
        case .gated(let gate, let detail):
            await gate.wait()
            return detail
        }
    }

    func receiptThumbnail(sha256: String) async throws -> ReceiptImage? { nil }

    func receiptImage(sha256: String) async throws -> ReceiptImage? { nil }

    private func resumeCallWaiters() {
        let ready = callWaiters.filter { updates.count >= $0.0 }
        callWaiters.removeAll { updates.count >= $0.0 }
        for (_, waiter) in ready { waiter.resume() }
    }
}
