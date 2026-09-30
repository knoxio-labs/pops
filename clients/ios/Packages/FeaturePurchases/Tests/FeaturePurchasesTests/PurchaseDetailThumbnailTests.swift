import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase detail receipt thumbnails")
@MainActor
internal struct PurchaseDetailThumbnailTests {
    @Test("detail preloads only the first receipt thumbnail")
    func loadsDetailAndOrderedThumbnails() async throws {
        let late = DetailGate()
        let detail = PurchaseDetail.fake(receiptURIs: [uri("first"), uri("second")])
        let first = ReceiptImage.fake(data: Data([1]))
        let second = ReceiptImage.fake(data: Data([2]))
        let repository = DetailRepositoryDouble(
            details: [.value(detail)],
            thumbnails: ["first": .gated(late, first), "second": .value(second)])
        let model = PurchaseDetailViewModel(
            id: "purchase", dependencies: .fake(purchases: repository))
        let loading = Task { await model.load() }
        await repository.waitForThumbnailCalls(1)
        #expect(model.receiptThumbnailState == .loading)
        await late.open()
        await loading.value

        #expect(model.phase == .loaded(detail, refresh: nil))
        #expect(model.receiptPages.map(\.pageIndex) == [0])
        #expect(model.receiptThumbnails == [first])
        #expect(model.receiptThumbnailState == .loaded)
        #expect(await repository.counts().thumbnails == ["first"])
    }

    @Test("a failed thumbnail request settles the asset placeholder")
    func unavailableThumbnailSettles() async {
        let detail = PurchaseDetail.fake(receiptURIs: [uri("missing")])
        let repository = DetailRepositoryDouble(
            details: [.value(detail)], thumbnails: ["missing": .failure(.unavailable)])
        let model = PurchaseDetailViewModel(
            id: "purchase", dependencies: .fake(purchases: repository))

        await model.load()

        #expect(model.phase == .loaded(detail, refresh: nil))
        #expect(model.receiptPages.isEmpty)
        #expect(model.receiptThumbnailState == .unavailable)
    }

    private func uri(_ hash: String) -> String { "pops://purchases/receipt/\(hash)" }
}
