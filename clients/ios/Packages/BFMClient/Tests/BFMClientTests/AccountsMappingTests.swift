import AppCore
import Testing

@testable import BFMClient

@Suite("Accounts list mapping")
internal struct AccountsMappingTests {
    @Test("a row becomes an account in the app's own vocabulary")
    func mapsARow() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(status: .ok, json: AccountsWire.page(AccountsWire.account())))

        let accounts = try await repository.accounts()

        let account = try #require(accounts.first)
        #expect(account.id == "acc-1")
        #expect(account.name == "Everyday")
        #expect(account.kind == .checking)
        #expect(account.balance == MoneyAmount(minorUnits: 125_000, currencyCode: "AUD"))
        #expect(account.institutionName == "ANZ")
        #expect(account.archived == false)
    }

    /// The wire now carries a real count (POPS-2924) — finance's own literal
    /// row count for the account, not a value this mapper invents.
    @Test("carries the wire's transaction count through, zero included")
    func carriesTransactionCount() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok, json: AccountsWire.page(AccountsWire.account(transactionCount: 412))))
        let account = try #require(try await repository.accounts().first)
        #expect(account.transactionCount == 412)

        let empty = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok, json: AccountsWire.page(AccountsWire.account(transactionCount: 0))))
        let emptyAccount = try #require(try await empty.accounts().first)
        #expect(emptyAccount.transactionCount == 0)
    }

    @Test("a checkpoint-anchored balance is distinguishable from a derived one")
    func carriesTheBalanceBasis() async throws {
        let anchored = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(AccountsWire.account(basis: "checkpoint"))))
        let derived = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(AccountsWire.account(basis: "transactions"))))

        #expect(try await anchored.accounts().first?.balanceBasis == .checkpoint)
        #expect(try await derived.accounts().first?.balanceBasis == .transactions)
    }

    @Test("carries finance's own reading that the ledger and a checkpoint disagree")
    func carriesTheInconsistencyFlag() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(AccountsWire.account(inconsistent: "true"))))

        #expect(try await repository.accounts().first?.balanceInconsistent == true)
    }

    @Test("a liability's balance stays negative rather than being read as money held")
    func keepsTheLedgerSign() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(
                    AccountsWire.account(kind: "credit-card", balanceCents: -213_755))))

        let account = try #require(try await repository.accounts().first)

        #expect(account.balance.minorUnits == -213_755)
        #expect(account.kind.side == .liability)
    }

    /// The reason ``AccountKind`` is a raw-value wrapper: a kind finance adds
    /// after this build ships must reach the screen, not blank the list.
    @Test("a kind this build has never heard of survives intact")
    func carriesAnUnknownKind() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(AccountsWire.account(kind: "term-deposit"))))

        #expect(try await repository.accounts().first?.kind.rawValue == "term-deposit")
    }

    @Test("a person ledger carries its contact and no institution")
    func carriesAContact() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(
                    AccountsWire.account(
                        kind: "person",
                        institutionId: "null",
                        institutionName: "null",
                        contact: "\"Jo\""))))

        let account = try #require(try await repository.accounts().first)

        #expect(account.contact == "Jo")
        #expect(account.institutionName == nil)
    }

    @Test("the as-of date is read in the device's zone, not UTC")
    func readsTheAsOfDateInTheDeviceZone() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok, json: AccountsWire.page(AccountsWire.account(asOf: "2026-09-05"))))

        let account = try #require(try await repository.accounts().first)

        #expect(
            account.balanceAsOf == (try TransactionsWire.midnight(year: 2026, month: 9, day: 5)))
    }

    /// Strict on purpose. A producer that started sending a timestamp would
    /// otherwise land the balance a few hours out, silently.
    @Test("an as-of value that is not a bare date fails the list rather than being dropped")
    func refusesATimestampWhereADateBelongs() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(
                status: .ok,
                json: AccountsWire.page(
                    AccountsWire.account(asOf: "2026-09-05T00:00:00.000Z"))))

        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await repository.accounts()
        }
    }
}
