import AppCore
import Foundation

/// The detail fixtures with their bank match staged: matched and confirmed,
/// part matched by the sweep, and matched while finance could not describe
/// the transaction.
@MainActor
internal enum PurchaseDetailBankMatchFixtures {
    /// ALDI, matched in full to one transaction a person confirmed.
    static let matched = with(
        PurchaseDetailFixtures.aldi,
        accounting: split(total: 802, matched: 802),
        matches: [
            match(
                "aldi-1", 802, .confirmed,
                statement: statement("ALDI STORES MASCOT", -802, on: "pur-aldi"))
        ])

    /// The chemist, part matched by the sweep: one transaction for part of it,
    /// the rest never explained.
    static let partial = with(
        PurchaseDetailSurfaces.sample(for: purchase("pur-chemist")),
        accounting: split(total: 3_495, matched: 2_000, residual: 1_495),
        matches: [
            match(
                "chemist-1", 2_000, .automatic,
                statement: statement("CHEMIST WAREHOUSE 412", -2_000, on: "pur-chemist"))
        ])

    /// One transaction paying for this and more: the statement's own amount shows.
    static let shared = with(
        PurchaseDetailSurfaces.sample(for: purchase("pur-kmart")),
        accounting: split(total: 3_000, matched: 3_000),
        matches: [
            match(
                "kmart-1", 3_000, .automatic,
                statement: statement("KMART 1071 BROADWAY", -5_450, on: "pur-kmart"))
        ])

    /// Matched, but finance did not answer, so only the match's own amount shows.
    static let undescribed = with(
        PurchaseDetailFixtures.aldi,
        accounting: split(total: 802, matched: 802),
        matches: [match("aldi-1", 802, .confirmed, statement: nil)])

    private static func purchase(_ id: String) -> Purchase {
        PurchasesFixtures.history.first { $0.id == id } ?? PurchasesFixtures.history[0]
    }

    private static func with(
        _ detail: PurchaseDetail, accounting: PurchaseAccounting, matches: [PurchaseChargeMatch]
    ) -> PurchaseDetail {
        var staged = detail
        staged.accounting = accounting
        staged.charges = [
            PurchaseCharge(
                id: "\(detail.id)-charge", amount: detail.purchase.total, role: "capture",
                origin: "merchant", chargedOn: detail.purchase.orderedOn, matches: matches)
        ]
        return staged
    }

    private static func split(total: Int, matched: Int, residual: Int = 0) -> PurchaseAccounting {
        PurchaseAccounting(
            total: Fixtures.money(total),
            matched: Fixtures.money(matched),
            awaitingImport: Fixtures.money(0),
            residual: Fixtures.money(residual),
            refunded: Fixtures.money(0),
            netSpend: Fixtures.money(total))
    }

    private static func match(
        _ id: String, _ cents: Int, _ method: PurchaseMatchMethod,
        statement: MatchedBankTransaction?
    ) -> PurchaseChargeMatch {
        PurchaseChargeMatch(
            id: id, transactionID: "tx-\(id)", amount: Fixtures.money(cents), method: method,
            transaction: statement)
    }

    private static func statement(_ descriptor: String, _ cents: Int, on id: String)
        -> MatchedBankTransaction
    {
        MatchedBankTransaction(
            description: descriptor, date: purchase(id).orderedOn,
            amount: Fixtures.money(cents), accountName: "Everyday")
    }
}
