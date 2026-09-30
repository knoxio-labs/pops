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
        await late.open()
        await loading.value

        #expect(model.phase == .loaded(detail, refresh: nil))
        #expect(model.receiptPages.map(\.pageIndex) == [0])
        #expect(model.receiptThumbnails == [first])
        #expect(await repository.counts().thumbnails == ["first"])
    }

    private func uri(_ hash: String) -> String { "pops://purchases/receipt/\(hash)" }
}
