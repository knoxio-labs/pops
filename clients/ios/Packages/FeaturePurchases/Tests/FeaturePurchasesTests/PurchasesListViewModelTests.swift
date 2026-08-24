import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@Suite("Purchases list")
@MainActor
internal struct PurchasesListViewModelTests {
    @Test("loads the purchase rows the repository returns")
    func loadsRows() async {
        let purchase = Purchase(
            id: "purchase-1",
            merchantName: "Kmart",
            orderedOn: .now,
            total: MoneyAmount(minorUnits: 1999, currencyCode: "AUD"),
            itemCount: 3,
            receiptURI: nil
        )
        let dependencies = AppDependencies.fake(
            purchases: InMemoryPurchasesRepository(rows: [purchase])
        )
        let model = PurchasesListViewModel(dependencies: dependencies)

        await model.load()

        #expect(model.purchases == [purchase])
        #expect(model.failure == nil)
        #expect(!model.isLoading)
    }

    @Test("stops loading when the request is cancelled")
    func stopsLoadingWhenCancelled() async {
        let dependencies = AppDependencies.fake(purchases: CancellingPurchasesRepository())
        let model = PurchasesListViewModel(dependencies: dependencies)

        await model.load()

        #expect(!model.isLoading)
        #expect(model.failure == nil)
    }
}

private struct CancellingPurchasesRepository: PurchasesRepository {
    func purchases(after cursor: String?) async throws -> PurchasePage {
        throw CancellationError()
    }
}
