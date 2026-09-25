import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository bank match mapping")
internal struct PurchaseBankMatchMappingTests {
    @Test("a linked purchase maps its split and a confirmed, described match")
    func linked() async throws {
        let detail = try await Self.detail(
            accounting: Self.accountingJSON(matched: 1_275, awaitingImport: 0, residual: 0),
            charges: Self.chargeJSON(
                amount: 1_275,
                matches: [Self.matchJSON(id: "link-1", amount: 1_275, method: "confirmed")]))

        #expect(
            detail.accounting == Self.accounting(matched: 1_275, awaitingImport: 0, residual: 0))
        let chargedOn = try TransactionsWire.midnight(year: 2026, month: 9, day: 20)
        let statementDay = try TransactionsWire.midnight(year: 2026, month: 9, day: 21)
        let charge = try #require(detail.charges.first)
        #expect(charge.id == "charge-1")
        #expect(charge.amount == Self.aud(1_275))
        #expect(charge.role == "capture")
        #expect(charge.origin == "merchant")
        #expect(charge.chargedOn == chargedOn)
        #expect(
            charge.matches == [
                PurchaseChargeMatch(
                    id: "link-1", transactionID: "tx-link-1", amount: Self.aud(1_275),
                    method: .confirmed,
                    transaction: MatchedBankTransaction(
                        description: "CAFE SYDNEY", date: statementDay,
                        amount: MoneyAmount(minorUnits: -1_275, currencyCode: "AUD"),
                        accountName: "Everyday"))
            ])
    }

    @Test("a partial match keeps the matched amount apart from the charge and the residual")
    func partial() async throws {
        let detail = try await Self.detail(
            accounting: Self.accountingJSON(matched: 500, awaitingImport: 0, residual: 775),
            charges: Self.chargeJSON(
                amount: 1_275,
                matches: [Self.matchJSON(id: "link-1", amount: 500, method: "automatic")]))

        let accounting = try #require(detail.accounting)
        #expect(accounting.matched == Self.aud(500))
        #expect(accounting.residual == Self.aud(775))
        #expect(accounting.unmatched == Self.aud(775))
        let match = try #require(detail.charges.first?.matches.first)
        #expect(match.amount == Self.aud(500))
        #expect(match.method == .automatic)
    }

    @Test("an unmatched purchase has charges with no matches and its whole total awaiting")
    func unmatched() async throws {
        let detail = try await Self.detail(
            accounting: Self.accountingJSON(matched: 0, awaitingImport: 1_275, residual: 0),
            charges: Self.chargeJSON(amount: 1_275, matches: []))

        #expect(detail.accounting?.unmatched == Self.aud(1_275))
        #expect(detail.charges.map(\.matches) == [[]])
    }

    @Test("a match finance did not describe keeps its amount and method with no transaction")
    func undescribedMatch() async throws {
        let bare =
            #"{"amountCents":1275,"id":"link-1","matchedBy":"automatic","#
            + #""transaction":null,"transactionId":"tx-link-1"}"#
        let detail = try await Self.detail(
            accounting: Self.accountingJSON(matched: 1_275, awaitingImport: 0, residual: 0),
            charges: Self.chargeJSON(amount: 1_275, matches: [bare]))

        let match = try #require(detail.charges.first?.matches.first)
        #expect(match.transaction == nil)
        #expect(match.amount == Self.aud(1_275))
        #expect(match.transactionID == "tx-link-1")
    }

    @Test("a server that predates the bank match maps to no split and no charges")
    func absentFields() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: PurchaseDetailMappingTests.detailJSON))

        let detail = try #require(try await repository.purchaseDetail(id: "purchase-1"))

        #expect(detail.accounting == nil)
        #expect(detail.charges.isEmpty)
    }

    @Test("an unreadable transaction date is a contract mismatch, not a silent drop")
    func malformedTransactionDate() async throws {
        let json = Self.withBankMatch(
            PurchaseDetailMappingTests.detailJSON,
            accounting: Self.accountingJSON(matched: 1_275, awaitingImport: 0, residual: 0),
            charges: Self.chargeJSON(
                amount: 1_275,
                matches: [Self.matchJSON(id: "link-1", amount: 1_275, method: "confirmed")]
            ).replacingOccurrences(of: "2026-09-21", with: "21/09/2026"))
        let repository = try BFMPurchasesRepository.stubbed(StubTransport(status: .ok, json: json))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchaseDetail(id: "purchase-1")
        }
    }

    @Test("an update answer maps its bank match the way the detail read does")
    func updateAnswer() async throws {
        let json = Self.withBankMatch(
            PurchaseUpdateMappingTests.detailJSON,
            accounting: Self.accountingJSON(matched: 1_275, awaitingImport: 0, residual: 0),
            charges: Self.chargeJSON(
                amount: 1_275,
                matches: [Self.matchJSON(id: "link-1", amount: 1_275, method: "confirmed")]))
        let repository = try BFMPurchasesRepository.stubbed(StubTransport(status: .ok, json: json))
        let update = PurchaseUpdate(lines: [], expectedUpdatedAt: "opaque-old-token")

        let detail = try #require(try await repository.updatePurchase(id: "purchase-1", update))

        #expect(detail.charges.first?.matches.first?.method == .confirmed)
        #expect(detail.charges.first?.matches.first?.transaction?.description == "CAFE SYDNEY")
        #expect(detail.accounting?.matched == Self.aud(1_275))
    }

    private static func detail(accounting: String, charges: String) async throws -> PurchaseDetail {
        let json = withBankMatch(
            PurchaseDetailMappingTests.detailJSON, accounting: accounting, charges: charges)
        let repository = try BFMPurchasesRepository.stubbed(StubTransport(status: .ok, json: json))
        return try #require(try await repository.purchaseDetail(id: "purchase-1"))
    }

    private static func withBankMatch(_ json: String, accounting: String, charges: String)
        -> String
    {
        let trimmed = json.trimmingCharacters(in: .whitespacesAndNewlines)
        return String(trimmed.dropLast()) + #","accounting":\#(accounting),"charges":\#(charges)}"#
    }

    private static func aud(_ minorUnits: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD")
    }

    private static func accounting(matched: Int, awaitingImport: Int, residual: Int)
        -> PurchaseAccounting
    {
        PurchaseAccounting(
            total: aud(1_275), matched: aud(matched), awaitingImport: aud(awaitingImport),
            residual: aud(residual), refunded: aud(0), netSpend: aud(1_275))
    }

    private static func accountingJSON(matched: Int, awaitingImport: Int, residual: Int)
        -> String
    {
        #"{"awaitingImportCents":\#(awaitingImport),"matchedCents":\#(matched),"#
            + #""netSpendCents":1275,"refundedCents":0,"residualCents":\#(residual),"#
            + #""totalCents":1275}"#
    }

    private static func chargeJSON(amount: Int, matches: [String]) -> String {
        #"[{"amountCents":\#(amount),"chargedOn":"2026-09-20","currency":"AUD","#
            + #""id":"charge-1","matches":[\#(matches.joined(separator: ","))],"#
            + #""origin":"merchant","role":"capture"}]"#
    }

    private static func matchJSON(id: String, amount: Int, method: String) -> String {
        #"{"amountCents":\#(amount),"id":"\#(id)","matchedBy":"\#(method)","#
            + #""transaction":{"accountName":"Everyday","amount":-12.75,"currency":"AUD","#
            + #""date":"2026-09-21","description":"CAFE SYDNEY"},"transactionId":"tx-\#(id)"}"#
    }
}
