import AppCore
import Foundation

// The detail read and the update answer each generate their own copy of these
// payloads; the protocols let one mapping serve both.

internal protocol BankMatchAccountingWire {
    var totalCents: Int { get }
    var matchedCents: Int { get }
    var awaitingImportCents: Int { get }
    var residualCents: Int { get }
    var refundedCents: Int { get }
    var netSpendCents: Int { get }
}

internal protocol BankMatchTransactionWire {
    var description: String { get }
    var date: String { get }
    var amount: Double { get }
    var currency: String { get }
    var accountName: String? { get }
}

internal protocol BankMatchWire {
    associatedtype Transaction: BankMatchTransactionWire
    var id: String { get }
    var transactionId: String? { get }
    var amountCents: Int { get }
    var isConfirmed: Bool { get }
    var transaction: Transaction? { get }
}

internal protocol BankMatchChargeWire {
    associatedtype Match: BankMatchWire
    var id: String { get }
    var amountCents: Int { get }
    var currency: String { get }
    var role: String { get }
    var origin: String { get }
    var chargedOn: String? { get }
    var matches: [Match] { get }
}

extension BFMPurchasesRepository {
    static func accounting(
        from wire: (some BankMatchAccountingWire)?, currency: String
    ) -> PurchaseAccounting? {
        guard let wire else { return nil }
        func money(_ minorUnits: Int) -> MoneyAmount {
            MoneyAmount(minorUnits: minorUnits, currencyCode: currency)
        }
        return PurchaseAccounting(
            total: money(wire.totalCents),
            matched: money(wire.matchedCents),
            awaitingImport: money(wire.awaitingImportCents),
            residual: money(wire.residualCents),
            refunded: money(wire.refundedCents),
            netSpend: money(wire.netSpendCents))
    }

    func charges(from wire: [some BankMatchChargeWire]?) throws -> [PurchaseCharge] {
        try (wire ?? []).map { charge in
            PurchaseCharge(
                id: charge.id,
                amount: MoneyAmount(minorUnits: charge.amountCents, currencyCode: charge.currency),
                role: charge.role,
                origin: charge.origin,
                chargedOn: try charge.chargedOn.map(day),
                matches: try charge.matches.map { try match(from: $0, currency: charge.currency) })
        }
    }

    private func match(from wire: some BankMatchWire, currency: String) throws
        -> PurchaseChargeMatch
    {
        PurchaseChargeMatch(
            id: wire.id,
            transactionID: wire.transactionId,
            amount: MoneyAmount(minorUnits: wire.amountCents, currencyCode: currency),
            method: wire.isConfirmed ? .confirmed : .automatic,
            transaction: try wire.transaction.map(transaction))
    }

    private func transaction(from wire: some BankMatchTransactionWire) throws
        -> MatchedBankTransaction
    {
        guard
            let majorUnits = BFMTransactionsRepository.majorUnits(of: wire.amount),
            let amount = MoneyAmount(majorUnits: majorUnits, currencyCode: wire.currency)
        else { throw RepositoryError.contractMismatch }
        return MatchedBankTransaction(
            description: wire.description,
            date: try day(wire.date),
            amount: amount,
            accountName: wire.accountName)
    }

    private func day(_ raw: String) throws -> Date {
        guard let date = Self.day(from: raw, in: timeZone()) else {
            throw RepositoryError.contractMismatch
        }
        return date
    }
}

private typealias GetDetail = Operations.MobilePurchases_getPurchase.Output.Ok.Body.JsonPayload
private typealias UpdateDetail =
    Operations.MobilePurchases_updatePurchase.Output.Ok.Body.JsonPayload

extension GetDetail.AccountingPayload: BankMatchAccountingWire {}
extension GetDetail.ChargesPayloadPayload: BankMatchChargeWire {}
extension GetDetail.ChargesPayloadPayload.MatchesPayloadPayload: BankMatchWire {
    var isConfirmed: Bool { matchedBy == .confirmed }
}
extension GetDetail.ChargesPayloadPayload.MatchesPayloadPayload.TransactionPayload:
    BankMatchTransactionWire
{}

extension UpdateDetail.AccountingPayload: BankMatchAccountingWire {}
extension UpdateDetail.ChargesPayloadPayload: BankMatchChargeWire {}
extension UpdateDetail.ChargesPayloadPayload.MatchesPayloadPayload: BankMatchWire {
    var isConfirmed: Bool { matchedBy == .confirmed }
}
extension UpdateDetail.ChargesPayloadPayload.MatchesPayloadPayload.TransactionPayload:
    BankMatchTransactionWire
{}
