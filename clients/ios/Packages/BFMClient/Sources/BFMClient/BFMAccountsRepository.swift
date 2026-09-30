import AppCore
import Foundation
import OpenAPIRuntime

/// The accounts list and one account's dashboard, read from the BFM.
///
/// Mirrors ``BFMTransactionsRepository`` in every structural respect — the same
/// status vocabulary, the same "a field this build cannot represent fails the
/// screen" strictness, the same absence of any credential of its own — and the
/// notes there are not repeated here.
///
/// What is different is how much of ``AccountDetail`` the wire can fill.
/// `/mobile/finance/accounts/:id` carries the account and its month-end
/// history; the credit-card cycle, the points plan and the gift card's
/// original value are modelled nowhere in finance (POPS-2925, POPS-2926), so
/// they are left `nil` rather than invented. ``AccountDetail`` makes each of
/// them optional precisely so a kind with nothing behind it draws no card.
public struct BFMAccountsRepository: AccountsRepository {
    private let client: BFMHTTPClient
    private let transactions: BFMTransactionsRepository
    private let timeZone: @Sendable () -> TimeZone

    /// Rows on the dashboard's recent card. Small on purpose: the card is a
    /// glance at what has moved, not the ledger — which is one tap away on its
    /// own screen, paged. The BFM's own default page is 25, sized for a
    /// scrolling list rather than a card.
    private static let recentTransactionLimit = 5

    /// - Parameters:
    ///   - client: Already carrying whatever authenticates a `/mobile/*` call.
    ///   - timeZone: Passed through to the transactions read behind the
    ///     dashboard's recent card, for the reason
    ///     ``BFMTransactionsRepository/init(client:timeZone:)`` gives.
    public init(
        client: BFMHTTPClient,
        timeZone: @escaping @Sendable () -> TimeZone = { .autoupdatingCurrent }
    ) {
        self.client = client
        self.transactions = BFMTransactionsRepository(client: client, timeZone: timeZone)
        self.timeZone = timeZone
    }

    public func accounts() async throws -> [Account] {
        var cursor: String?
        var consumedCursors: Set<String> = []
        var accounts: [Account] = []
        var seenIDs: Set<Account.ID> = []

        repeat {
            let page = try await accountPage(
                search: nil,
                archiveScope: .all,
                cursor: cursor,
                limit: 100
            )
            accounts.append(contentsOf: page.accounts.filter { seenIDs.insert($0.id).inserted })
            guard let nextCursor = page.nextCursor else { break }
            guard consumedCursors.insert(nextCursor).inserted else {
                throw RepositoryError.contractMismatch
            }
            cursor = nextCursor
        } while true

        return accounts
    }

    /// Reads one bounded account page after applying search and archive scope.
    ///
    /// A server-rejected cursor restarts the same filtered query at its first
    /// page. The list merges by id, so this lets paging continue without
    /// discarding rows it already rendered.
    public func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        if let page = try await fetchAccountPage(
            search: search,
            archiveScope: archiveScope,
            cursor: cursor,
            limit: limit
        ) {
            return page
        }
        guard cursor != nil else { throw RepositoryError.contractMismatch }
        guard
            let page = try await fetchAccountPage(
                search: search,
                archiveScope: archiveScope,
                cursor: nil,
                limit: limit
            )
        else {
            throw RepositoryError.contractMismatch
        }
        return page
    }

    /// The account, its history, and the rows behind its recent card.
    ///
    /// The recent rows are fetched second and separately, and a failure there
    /// is NOT swallowed. It is the same class of failure as the account's own
    /// — the BFM not answering, or answering something this build cannot read
    /// — and a dashboard that quietly showed an empty recent card in that case
    /// would be claiming the account has no transactions.
    public func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        let output: GetAccount.Output
        do {
            output = try await client.generated.mobileFinance_getAccount(path: .init(id: id))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 { return nil }
            throw BFMRepositoryFailure.failure(error, operation: GetAccount.id)
        }

        guard let payload = try Self.payload(of: output) else { return nil }

        let recent = try await transactions.recentTransactions(
            forAccount: id, limit: Self.recentTransactionLimit)

        return AccountDetail(
            account: try account(fromDetail: payload.account),
            history: payload.history.map {
                AccountBalancePoint(month: $0.month, balanceMinorUnits: $0.balanceCents)
            },
            recentTransactions: recent
        )
    }
}

extension BFMAccountsRepository {
    /// The body, or `nil` for the one status that is answered rather than
    /// thrown — see ``BFMTransactionsRepository/transactionDetail(id:)``.
    private static func payload(of output: GetAccount.Output) throws -> DetailPayload? {
        switch output {
        case .ok(let ok):
            return try ok.body.json
        case .notFound:
            return nil
        case .badRequest:
            throw RepositoryError.transport("\(GetAccount.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetAccount.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: GetAccount.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: GetAccount.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport("\(GetAccount.id): undocumented status \(statusCode)")
        }
    }
}

/// The two account payloads the generator emits — one per operation, because
/// the contract declares the shape inline on each rather than as a shared
/// component — reduced to the fields this app reads.
///
/// It exists so the mapping below is written once. Without it the identical
/// twenty lines would appear twice, differing only in a generated type name,
/// which is the shape of bug where a field gets added to one and not the other.
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
    private func account(fromList wire: ListAccountRow) throws -> Account {
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
            ))
    }

    private func account(fromDetail wire: DetailAccountPayload) throws -> Account {
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
            ))
    }

    /// One wire account into the app's own vocabulary.
    ///
    /// `kind` and `currency` go through as raw values for the reason
    /// ``AccountKind`` states: a kind added to finance after this build shipped
    /// must reach the screen, not fail the list.
    ///
    /// `asOf` is required to parse. It is not decoration on a balance — it is
    /// the date the figure is claimed true as of, and a screen that dropped an
    /// unparseable one would print a number with no date beside it, which reads
    /// as "current".
    private func account(from wire: AccountWire) throws -> Account {
        guard let balanceAsOf = ISO8601Day.parse(wire.asOf, in: timeZone()) else {
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

/// The generated names, shortened — see the note at the foot of
/// ``BFMTransactionsRepository``.
private typealias ListAccounts = Operations.MobileFinance_listAccounts
private typealias ListAccountsQuery = ListAccounts.Input.Query
private typealias GetAccount = Operations.MobileFinance_getAccount
private typealias ListAccountRow = ListAccounts.Output.Ok.Body.JsonPayload.AccountsPayloadPayload
private typealias DetailPayload = GetAccount.Output.Ok.Body.JsonPayload
private typealias DetailAccountPayload = DetailPayload.AccountPayload

extension BFMAccountsRepository {
    /// Returns `nil` only when the server rejects the cursor.
    private func fetchAccountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage? {
        let output: ListAccounts.Output
        do {
            output = try await client.generated.mobileFinance_listAccounts(
                query: .init(
                    search: search,
                    archived: archiveFilter(for: archiveScope),
                    cursor: cursor,
                    limit: limit
                ))
        } catch let error as ClientError {
            if BFMRepositoryFailure.code(in: error) == "invalid_cursor" {
                return nil
            }
            throw BFMRepositoryFailure.failure(error, operation: ListAccounts.id)
        }

        return try accountPageOutcome(of: output)
    }

    private func archiveFilter(
        for scope: AccountsArchiveScope
    ) -> ListAccountsQuery.ArchivedPayload? {
        switch scope {
        case .all: nil
        case .active: ._false
        case .archived: ._true
        }
    }

    private func accountPageOutcome(of output: ListAccounts.Output) throws -> AccountsPage? {
        switch output {
        case .ok(let ok):
            return try page(from: ok.body.json)
        case .badRequest(let refused):
            guard try refused.body.json.code == .invalidCursor else {
                throw RepositoryError.transport("\(ListAccounts.id): invalid request")
            }
            return nil
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(ListAccounts.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ListAccounts.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ListAccounts.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport("\(ListAccounts.id): undocumented status \(statusCode)")
        }
    }

    private func page(from payload: ListAccounts.Output.Ok.Body.JsonPayload) throws -> AccountsPage
    {
        AccountsPage(
            accounts: try payload.accounts.map(account(fromList:)),
            nextCursor: payload.nextCursor,
            totalCount: payload.totalCount
        )
    }
}
