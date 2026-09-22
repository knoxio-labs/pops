import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Purchase detail repository")
internal struct PurchaseDetailRepositoryTests {
    @Test("detail identity comes from its purchase and receipt order is preserved")
    func detailIdentityAndReceiptOrder() {
        let detail = PurchaseDetail.fake(
            purchase: .fake(id: "purchase-7", receiptURI: "compatibility-only"),
            receiptURIs: ["pops://receipt/second", "pops://receipt/first"]
        )

        #expect(detail.id == "purchase-7")
        #expect(detail.receiptURIs == ["pops://receipt/second", "pops://receipt/first"])
    }

    @Test("a detail can represent no receipt documents")
    func emptyReceiptList() {
        #expect(PurchaseDetail.fake(receiptURIs: []).receiptURIs.isEmpty)
    }

    @Test("the in-memory repository distinguishes missing and seeded details")
    func seededAndMissingDetail() async throws {
        let detail = PurchaseDetail.fake(purchase: .fake(id: "purchase-seeded"))
        let repository = InMemoryPurchasesRepository(details: [detail])

        #expect(try await repository.purchaseDetail(id: detail.id) == detail)
        #expect(try await repository.purchaseDetail(id: "missing") == nil)
    }

    @Test("thumbnail and full image reads share seeded receipt bytes")
    func seededAndMissingReceipts() async throws {
        let receipt = ReceiptImage.fake(mediaType: "image/png", data: Data([0xCA, 0xFE]))
        let repository = InMemoryPurchasesRepository(receipts: ["sha": receipt])

        #expect(try await repository.receiptThumbnail(sha256: "sha") == receipt)
        #expect(try await repository.receiptImage(sha256: "sha") == receipt)
        #expect(try await repository.receiptImage(sha256: "missing") == nil)
    }

    @Test("detail calls participate in the shared one-based failure schedule")
    func sharedFailureSchedule() async throws {
        let repository = InMemoryPurchasesRepository()
        await repository.fail(onCall: 2, with: .unavailable)

        _ = try await repository.purchaseDetail(id: "missing")
        await #expect(throws: RepositoryError.unavailable) {
            try await repository.receiptThumbnail(sha256: "missing")
        }
        #expect(await repository.callCount == 2)
    }
}
