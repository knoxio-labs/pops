import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("Account detail mapping")
internal struct AccountDetailMappingTests {
    private static func repository(
        detail: String,
        transactions: String = TransactionsWire.page(TransactionsWire.row)
    ) throws -> BFMAccountsRepository {
        try BFMAccountsRepository.stubbed(
            StubTransport.routed(
                accounts: (.ok, detail),
                transactions: (.ok, transactions)))
    }

    @Test("carries the month-end series in the order the BFM sent it")
    func mapsTheHistory() async throws {
        let repository = try Self.repository(
            detail: AccountsWire.detail(history: [
                AccountsWire.point(month: "2026-07", balanceCents: 1_000),
                AccountsWire.point(month: "2026-08", balanceCents: 2_500),
            ]))

        let detail = try #require(try await repository.accountDetail(id: "acc-1"))

        #expect(
            detail.history == [
                AccountBalancePoint(month: "2026-07", balanceMinorUnits: 1_000),
                AccountBalancePoint(month: "2026-08", balanceMinorUnits: 2_500),
            ])
    }

    @Test("an empty series is an empty trend, not a failure")
    func acceptsAnEmptyHistory() async throws {
        let repository = try Self.repository(detail: AccountsWire.detail())

        let detail = try #require(try await repository.accountDetail(id: "acc-1"))

        #expect(detail.history.isEmpty)
        #expect(detail.account.id == "acc-1")
    }

    @Test("asks the transactions route for this account's newest rows only")
    func scopesTheRecentRowsToTheAccount() async throws {
        let transport = StubTransport.routed(
            accounts: (.ok, AccountsWire.detail()),
            transactions: (.ok, TransactionsWire.page(TransactionsWire.row)))
        let repository = try BFMAccountsRepository.stubbed(transport)

        _ = try await repository.accountDetail(id: "acc-7")

        let sent = await transport.recorded.all
        let listed = try #require(
            sent.first { $0.operationID == "mobileFinance.listTransactions" })
        let query = try #require(listed.request.path)
        #expect(query.contains("accountId=acc-7"))
        #expect(query.contains("limit=5"))
    }

    @Test("the recent rows reach the dashboard")
    func carriesTheRecentRows() async throws {
        let repository = try Self.repository(
            detail: AccountsWire.detail(),
            transactions: TransactionsWire.page(
                TransactionsWire.row(id: "txn-a", amount: "19.99"),
                TransactionsWire.row(id: "txn-b", amount: "5.00")))

        let detail = try #require(try await repository.accountDetail(id: "acc-1"))

        #expect(detail.recentTransactions.map(\.id) == ["txn-a", "txn-b"])
    }

    /// An empty recent card would say this account has no transactions, which
    /// is a claim — and a false one when the truth is that the call failed.
    @Test("a failure fetching the recent rows fails the dashboard rather than emptying it")
    func doesNotSwallowARecentRowsFailure() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport.routed(
                accounts: (.ok, AccountsWire.detail()),
                transactions: (
                    .serviceUnavailable,
                    TransactionsWire.upstream(
                        code: "upstream_unavailable")
                )))

        await #expect(throws: RepositoryError.unavailable) {
            _ = try await repository.accountDetail(id: "acc-1")
        }
    }

    /// The same shape as `transactionDetail(id:)`: an account archived away
    /// between a list arriving and somebody opening it is the system working.
    @Test("an account finance no longer has is nil, not a failure")
    func answersNotFoundWithNil() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .notFound,
                json: TransactionsWire.upstream(code: "not_found")))

        #expect(try await repository.accountDetail(id: "gone") == nil)
    }

    @Test("a 404 costs no transactions call at all")
    func doesNotFetchRowsForAnAccountThatIsGone() async throws {
        let transport = StubTransport(
            status: .notFound, json: TransactionsWire.upstream(code: "not_found"))
        let repository = try BFMAccountsRepository.stubbed(transport)

        _ = try await repository.accountDetail(id: "gone")

        let sent = await transport.recorded.all
        #expect(sent.allSatisfy { $0.operationID != "mobileFinance.listTransactions" })
    }
}

@Suite("Accounts failures")
internal struct AccountsFailureTests {
    @Test("a rejected token ends the session, whichever way the BFM says it")
    func endsTheSession() async throws {
        let rejected = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .unauthorized, json: TransactionsWire.failure(code: "invalid_token")))
        let revoked = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .forbidden, json: TransactionsWire.failure(code: "device_revoked")))

        await #expect(throws: RepositoryError.unauthorized) { _ = try await rejected.accounts() }
        await #expect(throws: RepositoryError.unauthorized) { _ = try await revoked.accounts() }
    }

    /// The one distinction that must not collapse: "finance is not answering"
    /// is worth retrying and "finance answered something this build cannot
    /// read" is not.
    @Test("an unreachable pillar and an unreadable one stay different failures")
    func keepsUpstreamFailuresApart() async throws {
        let unavailable = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .badGateway, json: TransactionsWire.upstream(code: "upstream_unavailable")))
        let mismatch = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .badGateway,
                json: TransactionsWire.upstream(code: "upstream_contract_mismatch")))

        await #expect(throws: RepositoryError.unavailable) { _ = try await unavailable.accounts() }
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await mismatch.accounts()
        }
    }
}
