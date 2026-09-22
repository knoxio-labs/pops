import AppCore
import AppCoreFakes
import Synchronization
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase hand-entry model")
internal struct PurchaseHandEntryViewModelTests {
    @Test("a session starts with one blank form and no saved purchases")
    func initialState() {
        let model = makeModel(HandEntryRepository())

        #expect(model.draft == ReceiptDraftPresentation().blankDraft(currency: nil))
        #expect(model.saved == 0)
        #expect(!model.isSaving)
        #expect(model.failure == nil)
        #expect(model.validationFailure == nil)
        #expect(model.formGeneration == 0)
        #expect(model.savedPurchaseIDs.isEmpty)
    }

    @Test("a manual save writes the draft and records the purchase")
    func saveWritesManualPurchase() async {
        let repository = HandEntryRepository(results: [.success(.fake(id: "purchase-1"))])
        let model = makeModel(repository)
        let draft = validDraft()

        let saved = await model.save(draft)

        #expect(saved)
        #expect(await repository.payloads.count == 1)
        #expect(await repository.payloads[0].fields.totalCents == 3_100)
        #expect(model.savedPurchaseIDs == ["purchase-1"])
        #expect(model.saved == 0)
        #expect(model.formGeneration == 0)
    }

    @Test("a repository failure keeps the form and reports the exact conflict")
    func repositoryFailureKeepsForm() async {
        let repository = HandEntryRepository(results: [.failure(.conflict("purchase_locked"))])
        let model = makeModel(repository)
        let original = model.draft

        let saved = await model.save(validDraft())

        #expect(!saved)
        #expect(model.draft == original)
        #expect(model.failure == .conflict("purchase_locked"))
        #expect(model.validationFailure == nil)
        #expect(model.savedPurchaseIDs.isEmpty)
    }

    @Test("a validation failure makes no request and keeps the form")
    func validationFailureKeepsForm() async {
        let repository = HandEntryRepository()
        let model = makeModel(repository)
        let original = model.draft
        var invalid = validDraft()
        invalid.total.value = "thirty one dollars"

        let saved = await model.save(invalid)

        #expect(!saved)
        #expect(await repository.payloads.isEmpty)
        #expect(model.draft == original)
        #expect(model.validationFailure == .unparseableAmount)
        #expect(model.failure == nil)
    }

    @Test("a retry of the same draft reuses its pending key")
    func retryReusesKey() async {
        let repository = HandEntryRepository(results: [
            .failure(.transport("offline")), .success(.fake(id: "saved")),
        ])
        let keys = HandEntryKeySequence()
        let model = makeModel(repository, keys: keys)
        let draft = validDraft()

        #expect(!(await model.save(draft)))
        #expect(await model.save(draft))

        #expect(await repository.payloads.map(\.fields.idempotencyKey) == ["key-1", "key-1"])
    }

    @Test("a successful save spends its key even when the next draft is equal")
    func successfulSaveSpendsKey() async {
        let repository = HandEntryRepository(results: [
            .success(.fake(id: "one")), .success(.fake(id: "two")),
        ])
        let model = makeModel(repository, keys: HandEntryKeySequence())
        let draft = validDraft()

        #expect(await model.save(draft))
        #expect(await model.save(draft))

        #expect(await repository.payloads.map(\.fields.idempotencyKey) == ["key-1", "key-2"])
        #expect(model.savedPurchaseIDs == ["one", "two"])
    }

    @Test("add another advances only after a successful write")
    func addAnotherRequiresSuccess() async {
        let repository = HandEntryRepository(results: [.failure(.unavailable)])
        let model = makeModel(repository)
        let original = model.draft

        await model.addAnother(validDraft())

        #expect(model.draft == original)
        #expect(model.saved == 0)
        #expect(model.formGeneration == 0)
        #expect(model.savedPurchaseIDs.isEmpty)
    }

    @Test("add another carries the date and currency and advances the tally")
    func addAnotherStartsNextForm() async {
        let repository = HandEntryRepository(results: [.success(.fake(id: "saved"))])
        let model = makeModel(repository)
        let previous = validDraft()

        await model.addAnother(previous)

        #expect(model.draft.date.value == previous.date.value)
        #expect(model.draft.currency == previous.currency)
        #expect(model.draft.total.isEmpty)
        #expect(model.saved == 1)
        #expect(model.formGeneration == 1)
        #expect(model.savedPurchaseIDs == ["saved"])
    }

    @Test("two successful actions retain every purchase identity in order")
    func successfulActionsKeepIDOrder() async {
        let repository = HandEntryRepository(results: [
            .success(.fake(id: "first")), .success(.fake(id: "second")),
        ])
        let model = makeModel(repository)

        #expect(await model.save(validDraft()))
        await model.addAnother(validDraft())

        #expect(model.savedPurchaseIDs == ["first", "second"])
    }

    @Test("a second save while the first is in flight makes no second request")
    func inFlightSaveIsIgnored() async {
        let repository = HandEntryRepository(
            results: [.success(.fake(id: "saved"))], gatedCalls: [1])
        let model = makeModel(repository)
        let draft = validDraft()

        let first = Task { await model.save(draft) }
        await repository.waitForCallCount(1)
        let second = await model.save(draft)

        #expect(!second)
        #expect(await repository.payloads.count == 1)

        await repository.release()
        #expect(await first.value)
        #expect(model.savedPurchaseIDs == ["saved"])
    }

    private func makeModel(
        _ repository: HandEntryRepository,
        keys: HandEntryKeySequence = HandEntryKeySequence()
    ) -> PurchaseHandEntryViewModel {
        PurchaseHandEntryViewModel(repository: repository, makeIdempotencyKey: keys.next)
    }

    private func validDraft() -> ReceiptDraft {
        ReceiptDraft.fake(.tillNamedItems()).attributed()
    }
}

private final class HandEntryKeySequence: Sendable {
    private let count = Mutex(0)

    fileprivate func next() -> String {
        count.withLock { value in
            value += 1
            return "key-\(value)"
        }
    }
}

private actor HandEntryRepository: ReceiptCaptureRepository {
    fileprivate private(set) var payloads: [ReceiptManualPurchasePayload] = []

    private let results: [Result<ReceiptPurchase, RepositoryError>]
    private let gatedCalls: Set<Int>
    private var held: [CheckedContinuation<Void, Never>] = []
    private var waiters: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

    fileprivate init(
        results: [Result<ReceiptPurchase, RepositoryError>] = [],
        gatedCalls: Set<Int> = []
    ) {
        self.results = results
        self.gatedCalls = gatedCalls
    }

    fileprivate func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        throw RepositoryError.transport("extract is not part of hand entry")
    }

    fileprivate func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        throw RepositoryError.transport("saveDraft is not part of hand entry")
    }

    fileprivate func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        payloads.append(payload)
        let call = payloads.count
        let reached = waiters.filter { $0.count <= call }
        waiters.removeAll { $0.count <= call }
        for waiter in reached { waiter.continuation.resume() }
        if gatedCalls.contains(call) {
            await withCheckedContinuation { held.append($0) }
        }
        guard results.indices.contains(call - 1) else {
            throw RepositoryError.transport("manual purchase script exhausted")
        }
        return try results[call - 1].get()
    }

    fileprivate func waitForCallCount(_ count: Int) async {
        guard payloads.count < count else { return }
        await withCheckedContinuation { waiters.append((count, $0)) }
    }

    fileprivate func release() {
        for continuation in held { continuation.resume() }
        held = []
    }
}
