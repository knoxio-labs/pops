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

    @Test("an update replaces the full line set while preserving untouched detail fields")
    func appliesCompleteUpdate() async throws {
        let detail = Self.updateDetail
        let repository = InMemoryPurchasesRepository(rows: [detail.purchase], details: [detail])

        let saved = try #require(
            try await repository.updatePurchase(id: detail.id, Self.completeUpdate))

        #expect(saved.purchase.merchant == detail.purchase.merchant)
        #expect(saved.purchase.orderedOn == detail.purchase.orderedOn)
        #expect(saved.purchase.total.minorUnits == 1_700)
        #expect(saved.purchase.itemCount == 3)
        #expect(saved.purchase.status == .partial)
        #expect(saved.subtotal == detail.subtotal)
        #expect(saved.tax == detail.tax)
        #expect(saved.source == detail.source)
        #expect(saved.receiptURIs == detail.receiptURIs)
        #expect(saved.updatedAt == "opaque-token")
        #expect(saved.lines.map(\.id).contains("removed") == false)
        #expect(saved.lines.map(\.name) == ["Renamed", "Added"])
        #expect(saved.lines[0].quantity == 2)
        #expect(saved.lines[0].hasInventoryLink)
        #expect(!saved.lines[1].hasInventoryLink)
        #expect(saved.lines[1].id != "kept")
        #expect(
            try await repository.purchases(after: nil, statusFilter: .all).purchases.first?.total
                == saved.purchase.total)
    }

    @Test("a missing purchase answers nil without creating a detail")
    func missingUpdate() async throws {
        let repository = InMemoryPurchasesRepository()

        #expect(try await repository.updatePurchase(id: "missing", Self.update) == nil)
        #expect(try await repository.purchaseDetail(id: "missing") == nil)
    }

    @Test("update calls honour the shared failure schedule")
    func updateFailureInjection() async {
        let detail = PurchaseDetail.fake()
        let repository = InMemoryPurchasesRepository(details: [detail])
        await repository.fail(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.updatePurchase(id: detail.id, Self.update)
        }
        #expect(await repository.callCount == 1)
    }

    private static let update = PurchaseUpdate(
        lines: [], expectedUpdatedAt: "opaque-token")

    private static let updateDetail = PurchaseDetail.fake(
        purchase: .fake(
            id: "purchase-1", merchant: .printed("Original"),
            orderedOn: Date(timeIntervalSince1970: 100),
            total: MoneyAmount(minorUnits: 1_500, currencyCode: "AUD"),
            receiptURI: "compatibility", status: .partial),
        subtotal: MoneyAmount(minorUnits: 1_300, currencyCode: "AUD"),
        tax: MoneyAmount(minorUnits: 200, currencyCode: "AUD"),
        source: "receipt",
        lines: [
            .fake(
                id: "kept", name: "Old",
                lineTotal: .init(minorUnits: 800, currencyCode: "AUD"),
                hasInventoryLink: true),
            .fake(
                id: "removed", name: "Remove",
                lineTotal: .init(minorUnits: 500, currencyCode: "AUD")),
        ],
        receiptURIs: ["pops://receipt/original"],
        updatedAt: "opaque-token"
    )

    private static let completeUpdate = PurchaseUpdate(
        totalCents: 1_700,
        lines: [
            PurchaseUpdateLine(
                id: "kept", name: "Renamed", quantity: 2, lineTotalCents: 1_400),
            PurchaseUpdateLine(
                id: nil, name: "Added", quantity: 1, lineTotalCents: 300),
        ],
        expectedUpdatedAt: "opaque-token"
    )
}
