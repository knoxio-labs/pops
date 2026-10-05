import AppCore
import Foundation

internal typealias BFMAccountListRowPayload =
    Operations.MobileFinance_listAccounts.Output.Ok.Body.JsonPayload.AccountsPayloadPayload
internal typealias BFMAccountDetailPayload =
    Operations.MobileFinance_getAccount.Output.Ok.Body.JsonPayload.AccountPayload

private struct AccountWire {
    let id: String
    let name: String
    let kind: String
    let currency: String
    let archived: Bool
    let institutionName: String?
    let contact: String?
    let balanceCents: Int
    let asOf: String
    let isCheckpointAnchored: Bool
    let inconsistent: Bool
    let transactionCount: Int
}

extension BFMAccountsRepository {
    func account(fromList wire: BFMAccountListRowPayload, timeZone: TimeZone) throws -> Account {
        try account(
            from: AccountWire(
                id: wire.id,
                name: wire.name,
                kind: wire.kind,
                currency: wire.currency,
                archived: wire.archived,
                institutionName: wire.institutionName,
                contact: wire.contact,
                balanceCents: wire.balance.balanceCents,
                asOf: wire.balance.asOf,
                isCheckpointAnchored: wire.balance.basis == .checkpoint,
                inconsistent: wire.balance.inconsistent,
                transactionCount: wire.transactionCount
            ),
            timeZone: timeZone
        )
    }

    func account(fromDetail wire: BFMAccountDetailPayload, timeZone: TimeZone) throws -> Account {
        try account(
            from: AccountWire(
                id: wire.id,
                name: wire.name,
                kind: wire.kind,
                currency: wire.currency,
                archived: wire.archived,
                institutionName: wire.institutionName,
                contact: wire.contact,
                balanceCents: wire.balance.balanceCents,
                asOf: wire.balance.asOf,
                isCheckpointAnchored: wire.balance.basis == .checkpoint,
                inconsistent: wire.balance.inconsistent,
                transactionCount: wire.transactionCount
            ),
            timeZone: timeZone
        )
    }

    private func account(from wire: AccountWire, timeZone: TimeZone) throws -> Account {
        guard let balanceAsOf = ISO8601Day.parse(wire.asOf, in: timeZone) else {
            throw RepositoryError.contractMismatch
        }

        return Account(
            id: wire.id,
            name: wire.name,
            kind: AccountKind(rawValue: wire.kind),
            balance: MoneyAmount(minorUnits: wire.balanceCents, currencyCode: wire.currency),
            archived: wire.archived,
            institutionName: wire.institutionName,
            contact: wire.contact,
            balanceAsOf: balanceAsOf,
            balanceBasis: wire.isCheckpointAnchored ? .checkpoint : .transactions,
            balanceInconsistent: wire.inconsistent,
            transactionCount: wire.transactionCount
        )
    }
}
