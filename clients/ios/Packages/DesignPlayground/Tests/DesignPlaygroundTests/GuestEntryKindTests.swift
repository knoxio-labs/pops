import AppCore
import Foundation
import Testing

@testable import DesignPlayground

@Suite("Guest entry types")
internal struct GuestEntryKindTests {
    private func entry(_ minorUnits: Int, _ type: TransactionType, in account: GuestAccount)
        -> GuestEntry
    {
        GuestEntry(
            id: "txn", accountID: account.id, description: "Row",
            amount: MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"),
            date: Date(timeIntervalSince1970: 0), type: type)
    }

    @Test("a person account offers who-paid choices, an ordinary one the stored types")
    func optionsFollowTheAccount() {
        #expect(GuestEntryKind.options(for: GuestFixtures.ledger) == GuestEntryKind.personLedger)
        #expect(GuestEntryKind.options(for: GuestFixtures.household) == GuestEntryKind.ordinary)
    }

    @Test("every option round-trips through the row it writes")
    func optionsRoundTrip() {
        for account in [GuestFixtures.ledger, GuestFixtures.householdEditable] {
            for kind in GuestEntryKind.options(for: account) {
                let amount = kind.signed(MoneyAmount(minorUnits: 1_250, currencyCode: "AUD"))
                let row = entry(amount.minorUnits, kind.type, in: account)

                #expect(GuestEntryKind.matching(row, in: account) == kind)
            }
        }
    }

    @Test("no two options in one list write the same row")
    func optionsAreDistinct() {
        for options in [GuestEntryKind.personLedger, GuestEntryKind.ordinary] {
            let written = options.map { "\($0.type.rawValue)/\($0.raisesBalance)" }

            #expect(Set(written).count == options.count)
            #expect(Set(options.map(\.id)).count == options.count)
        }
    }

    @Test("the sign follows the option whatever sign was typed")
    func signIgnoresTheTypedSign() {
        let negative = MoneyAmount(minorUnits: -900, currencyCode: "AUD")

        #expect(GuestEntryKind.ownerPaidForMe.signed(negative).minorUnits == 900)
        #expect(GuestEntryKind.paidForOwner.signed(negative).minorUnits == -900)
        #expect(GuestEntryKind.paidForOwner.signed(negative).currencyCode == "AUD")
    }

    @Test("a zero row and a row of a type the form lacks match nothing")
    func unmatchedRows() {
        let ledger = GuestFixtures.ledger

        #expect(GuestEntryKind.matching(entry(0, .purchase, in: ledger), in: ledger) == nil)
        #expect(GuestEntryKind.matching(entry(500, .purchase, in: ledger), in: ledger) == nil)
        #expect(GuestEntryKind.matching(entry(-500, .income, in: ledger), in: ledger) == nil)
    }

    @Test("every fixture row is one the form can reopen")
    func fixturesAreExpressible() {
        for account in GuestFixtures.accounts {
            for row in GuestFixtures.entries(for: account) {
                #expect(GuestEntryKind.matching(row, in: account) != nil, "\(row.id)")
            }
        }
    }

    @Test("the ledger fixture's rows add up to its balance")
    func ledgerFixtureAgrees() {
        let total = GuestFixtures.ledgerEntries.reduce(0) { $0 + $1.amount.minorUnits }

        #expect(total == GuestFixtures.ledger.account.balance.minorUnits)
    }
}
