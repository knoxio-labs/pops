import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Purchases month summary")
internal struct PurchasesMonthSummaryTests {
    @Test("the fake returns its seeded summary after an injected failure")
    func seededFakeHonoursFailureInjection() async throws {
        let seeded = PurchasesMonthSummary(
            totals: [
                PurchasesCurrencyTotal(
                    total: MoneyAmount(minorUnits: 4_200, currencyCode: "AUD"),
                    netSpend: MoneyAmount(minorUnits: 3_900, currencyCode: "AUD"),
                    orderCount: 3)
            ],
            purchaseCount: 3,
            previousMonthTotals: nil,
            unmatchedCount: 1,
            merchantLeaders: []
        )
        let repository = InMemoryPurchasesRepository(summary: seeded)
        await repository.fail(onCall: 1, with: .unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.monthSummary(for: .distantPast)
        }
        #expect(try await repository.monthSummary(for: .distantFuture) == seeded)
        #expect(await repository.callCount == 2)
    }
}
