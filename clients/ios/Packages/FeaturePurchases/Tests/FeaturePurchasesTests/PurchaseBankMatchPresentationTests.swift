import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase bank match presentation")
internal struct PurchaseBankMatchPresentationTests {
    private static let locale = Locale(identifier: "en_AU")

    @Test("a partial match says how much of the total matched and what is still unmatched")
    func partial() {
        let presentation = Self.presentation(
            accounting: .fake(
                total: 24_900, matched: 10_000, awaitingImport: 4_900, residual: 10_000),
            charges: [.fake(matches: [.fake(amount: Self.aud(10_000))])])

        #expect(presentation.matchedOf == "$100.00 of $249.00 matched")
        #expect(presentation.unmatched == "$149.00 still unmatched")
    }

    @Test("a fully matched purchase states no partial figures")
    func linked() {
        let presentation = Self.presentation(
            accounting: .fake(total: 500, matched: 500, awaitingImport: 0),
            charges: [.fake(matches: [.fake()])])

        #expect(presentation.matchedOf == nil)
        #expect(presentation.unmatched == nil)
        #expect(presentation.rows.count == 1)
    }

    @Test("an unmatched purchase has no rows and no partial figures")
    func unmatched() {
        let presentation = Self.presentation(
            accounting: .fake(total: 500, matched: 0, awaitingImport: 500),
            charges: [.fake()])

        #expect(presentation.matchedOf == nil)
        #expect(presentation.unmatched == nil)
        #expect(presentation.rows.isEmpty)
    }

    @Test("a server with no split states no partial figures")
    func noAccounting() {
        let presentation = Self.presentation(accounting: nil, charges: [])

        #expect(presentation.matchedOf == nil)
        #expect(presentation.rows.isEmpty)
    }

    @Test("a described match shows its descriptor, day, account, amount and method")
    func describedRow() throws {
        let presentation = Self.presentation(
            accounting: .fake(total: 500, matched: 500, awaitingImport: 0),
            charges: [
                .fake(matches: [
                    .fake(
                        id: "link-1", amount: Self.aud(500), method: .confirmed,
                        transaction: .fake(
                            description: "IKEA RHODES", amount: Self.aud(-500),
                            accountName: "Everyday"))
                ])
            ])

        let row = try #require(presentation.rows.first)
        #expect(row.title == "IKEA RHODES")
        #expect(row.detail == "DAY · Everyday")
        #expect(row.amount == "$5.00")
        #expect(row.onStatement == nil)
        #expect(row.method == "Confirmed")
        #expect(row.methodSymbol == "checkmark.seal")
    }

    @Test("a match covering part of a bigger transaction shows the statement amount")
    func partOfTransaction() throws {
        let presentation = Self.presentation(
            accounting: .fake(total: 500, matched: 500, awaitingImport: 0),
            charges: [
                .fake(matches: [
                    .fake(amount: Self.aud(500), transaction: .fake(amount: Self.aud(-1_500)))
                ])
            ])

        #expect(presentation.rows.first?.onStatement == "$15.00 on the statement")
        #expect(presentation.rows.first?.method == "Automatic")
    }

    @Test("a match finance did not describe still shows its amount and method")
    func undescribedRow() throws {
        let presentation = Self.presentation(
            accounting: .fake(total: 500, matched: 500, awaitingImport: 0),
            charges: [.fake(matches: [.fake(amount: Self.aud(500), transaction: nil)])])

        let row = try #require(presentation.rows.first)
        #expect(row.title == "Bank transaction")
        #expect(row.detail == nil)
        #expect(row.amount == "$5.00")
        #expect(row.onStatement == nil)
    }

    private static func presentation(
        accounting: PurchaseAccounting?, charges: [PurchaseCharge]
    ) -> PurchaseBankMatchPresentation {
        PurchaseBankMatchPresentation(
            accounting: accounting, charges: charges, locale: locale, day: { _ in "DAY" })
    }

    private static func aud(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }
}
