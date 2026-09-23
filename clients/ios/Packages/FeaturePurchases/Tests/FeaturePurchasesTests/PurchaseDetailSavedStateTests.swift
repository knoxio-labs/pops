import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Saved purchase detail state")
@MainActor
internal struct PurchaseDetailSavedStateTests {
    @Test("a saved detail invalidates an older read")
    func savedDetailInvalidatesStaleRead() async {
        let gate = DetailGate()
        let stale = PurchaseDetail.fake(purchase: .fake(id: "stale"))
        let saved = PurchaseDetail.fake(purchase: .fake(id: "saved"))
        let repository = DetailRepositoryDouble(details: [.gated(gate, stale)])
        let model = model(repository)
        let loading = Task { await model.load() }
        await repository.waitForDetailCalls(1)

        model.applySaved(saved)
        await gate.open()
        await loading.value

        #expect(model.phase == .loaded(saved, refresh: nil))
    }

    @Test("saving fields keeps receipt images when their ordered URIs are unchanged")
    func savedDetailKeepsReceiptImages() async {
        let uri = uri("receipt")
        let image = ReceiptImage.fake(data: Data([7]))
        let original = PurchaseDetail.fake(receiptURIs: [uri])
        let saved = PurchaseDetail.fake(
            purchase: original.purchase, receiptURIs: [uri],
            edit: PurchaseEdit(editedAt: .now, changes: []))
        let repository = DetailRepositoryDouble(
            details: [.value(original)], thumbnails: ["receipt": .value(image)],
            images: ["receipt": .value(image)])
        let model = model(repository)
        await model.load()
        await model.openReceipt(at: 0)

        model.applySaved(saved)

        #expect(model.receiptPages.map(\.image) == [image])
        #expect(model.receiptFull == image)
        #expect(model.openReceiptIndex == 0)
    }

    @Test("saving a detail with different receipt URIs clears stale images")
    func savedDetailClearsChangedReceipts() async {
        let image = ReceiptImage.fake(data: Data([7]))
        let original = PurchaseDetail.fake(receiptURIs: [uri("old")])
        let repository = DetailRepositoryDouble(
            details: [.value(original)], thumbnails: ["old": .value(image)])
        let model = model(repository)
        await model.load()

        model.applySaved(.fake(receiptURIs: [uri("new")]))

        #expect(model.receiptPages.isEmpty)
        #expect(model.receiptFull == nil)
        #expect(model.openReceiptIndex == nil)
    }

    private func model(_ repository: DetailRepositoryDouble) -> PurchaseDetailViewModel {
        PurchaseDetailViewModel(
            id: "purchase", dependencies: .fake(purchases: repository))
    }

    private func uri(_ hash: String) -> String { "pops://purchases/receipt/\(hash)" }
}
