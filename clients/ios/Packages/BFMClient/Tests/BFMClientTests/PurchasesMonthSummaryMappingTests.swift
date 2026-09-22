import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository month summary mapping")
internal struct PurchasesMonthSummaryMappingTests {
    @Test("currency totals stay separate and merchant aggregates keep their wire facts")
    func mapsCurrenciesAndMerchantLeaders() async throws {
        let transport = StubTransport(
            status: .ok,
            json: """
                {"month":"2026-08","totals":[
                {"currency":"AUD","totalCents":4200,"netSpendCents":3900,"orderCount":3},
                {"currency":"USD","totalCents":1800,"netSpendCents":1700,"orderCount":2}],
                "purchaseCount":5,"previousMonthTotals":[],"unmatchedCount":1,
                "merchantLeaders":[{"merchantName":null,"currency":"USD",\
                "netSpendCents":1700,"orderCount":2}]}
                """
        )
        let repository = try BFMPurchasesRepository.stubbed(transport)

        let summary = try await repository.monthSummary(
            for: try TransactionsWire.midnight(year: 2026, month: 8, day: 20))

        #expect(
            summary.totals == [
                PurchasesCurrencyTotal(
                    total: MoneyAmount(minorUnits: 4200, currencyCode: "AUD"),
                    netSpend: MoneyAmount(minorUnits: 3900, currencyCode: "AUD"),
                    orderCount: 3),
                PurchasesCurrencyTotal(
                    total: MoneyAmount(minorUnits: 1800, currencyCode: "USD"),
                    netSpend: MoneyAmount(minorUnits: 1700, currencyCode: "USD"),
                    orderCount: 2),
            ])
        #expect(summary.purchaseCount == 5)
        #expect(summary.unmatchedCount == 1)
        #expect(
            summary.merchantLeaders == [
                PurchasesMerchantLeader(
                    merchantName: nil,
                    netSpend: MoneyAmount(minorUnits: 1700, currencyCode: "USD"),
                    orderCount: 2)
            ])
        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.path == "/mobile/purchases/summary?month=2026-08")
    }

    @Test("an absent previous month stays absent")
    func absentPreviousMonthStaysAbsent() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"month":"2026-08","totals":[],"purchaseCount":0,
                    "previousMonthTotals":null,"unmatchedCount":0,"merchantLeaders":[]}
                    """
            ))

        let summary = try await repository.monthSummary(for: .distantPast)

        #expect(summary.previousMonthTotals == nil)
    }

    @Test("summary authentication failures become repository authorization failures")
    func mapsAuthorizationFailure() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unauthorized,
                json: #"{"code":"invalid_token","message":"expired"}"#
            ))

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.monthSummary(for: .distantPast)
        }
    }
}
