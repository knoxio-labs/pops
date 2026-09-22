import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@MainActor
@Suite("Purchase review copy")
internal struct PurchaseReviewCopyTests {
    @Test("a single purchase has the plain Review title")
    func singleTitle() {
        #expect(PurchaseReviewCopy.title(position: 1, total: 1) == "Review")
    }

    @Test("a batch title states the bounded position and total")
    func batchTitle() {
        #expect(PurchaseReviewCopy.title(position: 2, total: 3) == "2 of 3")
    }

    @Test("cancel names one purchase or the whole batch")
    func cancelTitles() {
        #expect(PurchaseReviewCopy.cancelTitle(count: 1) == "Discard this purchase?")
        #expect(PurchaseReviewCopy.cancelTitle(count: 4) == "Discard all 4 purchases?")
    }

    @Test("saving subtitle never counts beyond the batch")
    func savingSubtitleClamps() {
        #expect(
            PurchaseReviewCopy.subtitle(saving: .saving(done: 1), written: 1, total: 3)
                == "Saving 2 of 3")
        #expect(
            PurchaseReviewCopy.subtitle(saving: .saving(done: 3), written: 3, total: 3)
                == "Saving 3 of 3")
        #expect(PurchaseReviewCopy.subtitle(saving: .idle, written: 2, total: 3) == "2 saved")
    }

    @Test("finished IDs appear only after the last remaining purchase is saved")
    func finishedIDs() async {
        let repository = InMemoryReceiptCaptureRepository(
            saveResult: .success(.fake(id: "saved")))
        let model = PurchaseReviewViewModel(entries: [entry()], repository: repository)

        #expect(model.finishedIDs == nil)
        await model.save()

        #expect(model.finishedIDs == ["saved"])
        #expect(model.remaining.isEmpty)
    }

    private func entry() -> ReviewEntry {
        let reading = ReceiptDraftReading(
            receiptUris: ["pops://purchases/receipt/test"],
            reconciled: true,
            failures: [],
            extracted: .tillNamedItems(),
            capture: nil,
            matchedMerchantEntityID: "merchant-1")
        return ReviewEntry(
            id: "entry",
            draft: ReceiptDraftPresentation().draft(
                extracted: reading.extracted,
                failures: reading.failures,
                matchedMerchantID: reading.matchedMerchantEntityID),
            origin: .read,
            reading: reading,
            status: nil,
            parts: [.fake()])
    }
}
