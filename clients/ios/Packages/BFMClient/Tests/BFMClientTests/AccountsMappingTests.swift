import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("Accounts list mapping")
struct AccountsMappingTests {
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

    /// The wire carries no count, so inventing one — a zero especially — would
    /// put "0 transactions" under a balance of $1,250 (POPS-2924).
    @Test("carries no transaction count, because the wire has none")
    func carriesNoTransactionCount() async throws {
        let repository = try BFMAccountsRepository.stubbed(
            StubTransport(status: .ok, json: AccountsWire.page(AccountsWire.account())))

        let account = try #require(try await repository.accounts().first)

        #expect(account.transactionCount == nil)
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
