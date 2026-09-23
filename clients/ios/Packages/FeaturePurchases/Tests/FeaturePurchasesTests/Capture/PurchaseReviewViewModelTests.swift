import AppCore
import AppCoreFakes
import Foundation
import Synchronization
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase review model")
internal struct PurchaseReviewViewModelTests {
    @Test("the edited draft is the draft written")
    func editedDraftIsSaved() async {
        let repository = ReviewWriteRepository(results: [.success(.fake(id: "saved"))])
        let original = entry(id: "one")
        let model = makeModel([original], repository: repository)
        var edited = original.draft
        edited.total.value = "12.34"

        model.edit("one", draft: edited)
        await model.save()

        #expect(await repository.savedDrafts[0].fields.totalCents == 1_234)
    }

    @Test("only unseen flagged or unsaveable drafts hold the batch")
    func holdingGate() {
        let model = makeModel(
            [
                entry(id: "clean"),
                entry(id: "flagged", flagged: true),
                entry(id: "unsaveable", saveable: false),
            ],
            repository: ReviewWriteRepository())

        #expect(model.holding == ["flagged", "unsaveable"])

        model.markSeen("flagged")
        model.markSeen("unsaveable")

        #expect(model.holding == ["unsaveable"])
    }

    @Test("a mixed batch uses each entry's write route and keeps saved IDs in order")
    func mixedRoutesAndSavedIDs() async {
        let repository = ReviewWriteRepository(results: [
            .success(.fake(id: "purchase-1")),
            .success(.fake(id: "purchase-2")),
            .success(.fake(id: "purchase-3")),
        ])
        let model = makeModel(
            [entry(id: "read-1"), entry(id: "manual", origin: .unreadable), entry(id: "read-2")],
            repository: repository)

        await model.save()

        #expect(await repository.routes == [.draft, .manual, .draft])
        #expect(model.savedPurchaseIDs == ["purchase-1", "purchase-2", "purchase-3"])
    }

    @Test("the first failure stops the batch after retaining earlier writes")
    func firstFailureStopsBatch() async {
        let repository = ReviewWriteRepository(results: [
            .success(.fake(id: "purchase-1")),
            .failure(.unavailable),
            .success(.fake(id: "purchase-3")),
        ])
        let model = makeModel(
            [entry(id: "one"), entry(id: "two"), entry(id: "three")],
            repository: repository)

        await model.save()

        #expect(await repository.routes.count == 2)
        #expect(model.savedPurchaseIDs == ["purchase-1"])
        #expect(model.remaining.map(\.id) == ["two", "three"])
        #expect(
            model.saving
                == .failed(
                    id: "two", reason: "The purchases service didn't answer.", retryable: true))
    }

    @Test("retry reuses a key until an edit makes a new intended payload")
    func retryKeyTracksDraft() async {
        let repository = ReviewWriteRepository(results: [
            .failure(.transport("offline")),
            .failure(.transport("offline")),
            .success(.fake(id: "saved")),
        ])
        let keys = KeySequence()
        let original = entry(id: "one")
        let model = makeModel([original], repository: repository, keys: keys)

        await model.save()
        #expect(
            model.saving
                == .failed(
                    id: "one", reason: "No connection, so nothing was saved.", retryable: true))
        await model.save()
        var edited = original.draft
        edited.total.value = "20.00"
        model.edit("one", draft: edited)
        await model.save()

        #expect(
            await repository.savedDrafts.map(\.fields.idempotencyKey)
                == ["key-1", "key-1", "key-2"])
        #expect(model.savedPurchaseIDs == ["saved"])
    }

    @Test("a cancelled write is not a failure, and the retry replays its key")
    func cancellationIsNotFailure() async {
        let repository = ReviewWriteRepository(
            results: [.success(.fake(id: "unused")), .success(.fake(id: "saved"))],
            cancelling: [1])
        let model = makeModel([entry(id: "one")], repository: repository)

        await model.save()
        #expect(model.saving == .idle)
        #expect(model.savedPurchaseIDs.isEmpty)

        await model.save()
        #expect(
            await repository.savedDrafts.map(\.fields.idempotencyKey) == ["key-1", "key-1"])
        #expect(model.savedPurchaseIDs == ["saved"])
    }

    @Test("a conflict blocks another save until its entry is discarded")
    func conflictBlocksUntilDiscard() async {
        let repository = ReviewWriteRepository(results: [
            .failure(.conflict("upstream_conflict")), .success(.fake(id: "unexpected")),
        ])
        let model = makeModel([entry(id: "one")], repository: repository)

        await model.save()
        await model.save()

        #expect(await repository.routes.count == 1)
        #expect(
            model.saving
                == .failed(
                    id: "one",
                    reason: "This receipt is already a purchase. Discard it to save the rest.",
                    retryable: false))
        #expect(model.saving.blocksSave)

        model.discard("one")

        #expect(model.saving == .idle)
        #expect(model.remaining.isEmpty)
    }

    @Test("an in-flight write ignores discard and a concurrent save")
    func inFlightActionsAreIgnored() async {
        let repository = ReviewWriteRepository(
            results: [.success(.fake(id: "one")), .success(.fake(id: "two"))], gating: [1])
        let model = makeModel([entry(id: "one"), entry(id: "two")], repository: repository)

        let first = Task { await model.save() }
        await repository.waitForCallCount(1)
        model.discard("one")
        await Task { await model.save() }.value

        #expect(await repository.routes.count == 1)
        #expect(model.remaining.map(\.id) == ["one", "two"])
        #expect(model.discarded.isEmpty)

        await repository.release()
        await first.value

        #expect(await repository.routes == [.draft, .draft])
        #expect(model.savedPurchaseIDs == ["one", "two"])
    }

    @Test("a payload validation failure is terminal without making a request")
    func validationFailure() async {
        let repository = ReviewWriteRepository()
        let original = entry(id: "one")
        let model = makeModel([original], repository: repository)
        var invalid = original.draft
        invalid.total.value = "twelve dollars"
        model.edit("one", draft: invalid)

        await model.save()

        #expect(await repository.routes.isEmpty)
        #expect(
            model.saving
                == .failed(
                    id: "one",
                    reason: ReceiptDraftCopy.message(for: .unparseableAmount),
                    retryable: false))
    }

    private func makeModel(
        _ entries: [ReviewEntry],
        repository: ReviewWriteRepository,
        keys: KeySequence = KeySequence()
    ) -> PurchaseReviewViewModel {
        PurchaseReviewViewModel(
            entries: entries, repository: repository, makeIdempotencyKey: keys.next)
    }

    private func entry(
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
