import AppCore
import Foundation
import Testing

@testable import DesignPlayground

@Suite("Guest wording")
internal struct GuestPresentationTests {
    private let presentation = GuestPresentation(
        locale: Locale(identifier: "en_AU"),
        timeZone: TimeZone(identifier: "Australia/Sydney") ?? .gmt)

    private func ledger(_ minorUnits: Int, role: GuestRole = .edit) -> GuestAccount {
        GuestAccount(
            account: Account(
                id: "acc", name: "Marta", kind: .person,
                balance: MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"),
                archived: false, contact: "Marta Ferreira"),
            role: role, owner: "Tomas")
    }

    private func entry(_ minorUnits: Int, _ type: TransactionType) -> GuestEntry {
        GuestEntry(
            id: "txn", accountID: "acc", description: "Dinner",
            amount: MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"),
            date: Date(timeIntervalSince1970: 1_790_900_000), type: type)
    }

    @Test("a person account is titled with the other party, never the guest's own name")
    func personLedgerIsTitledWithTheOwner() {
        #expect(presentation.title(ledger(100)) == "Tomas")
        #expect(presentation.title(GuestFixtures.household) == "Household bills")
    }

    @Test("a positive ledger balance is the guest's debt, printed without a sign")
    func positiveBalanceIsOwedByTheGuest() {
        let reading = presentation.balance(ledger(18_460))

        #expect(reading.caption == "You owe Tomas")
        #expect(reading.amount == "$184.60")
        #expect(reading.tone == .negative)
    }

    @Test("a negative ledger balance is owed to the guest, printed without a sign")
    func negativeBalanceIsOwedToTheGuest() {
        let reading = presentation.balance(ledger(-4_150))

        #expect(reading.caption == "Tomas owes you")
        #expect(reading.amount == "$41.50")
        #expect(reading.tone == .positive)
    }

    @Test("one cent either side of zero still names a direction")
    func theBoundaryIsExactlyZero() {
        #expect(presentation.balance(ledger(1)).caption == "You owe Tomas")
        #expect(presentation.balance(ledger(-1)).caption == "Tomas owes you")
        #expect(presentation.balance(ledger(0)).caption == "Settled up with Tomas")
        #expect(presentation.balance(ledger(0)).tone == .neutral)
    }

    @Test("an ordinary account keeps its own sign and plain caption")
    func ordinaryAccountKeepsItsSign() {
        let overdrawn = GuestAccount(
            account: Account(
                id: "acc-bills", name: "Bills", kind: .shared,
                balance: MoneyAmount(minorUnits: -2_500, currencyCode: "AUD"), archived: false),
            role: .view, owner: "Tomas")

        let reading = presentation.balance(overdrawn)

        #expect(reading.caption == "Balance")
        #expect(reading.amount == "-$25.00")
        #expect(reading.tone == .negative)
        #expect(presentation.balance(GuestFixtures.household).tone == .neutral)
    }

    @Test("only the view role is labelled")
    func viewRoleIsLabelled() {
        #expect(presentation.subtitle(ledger(0)) == "Shared ledger")
        #expect(presentation.subtitle(ledger(0, role: .view)) == "Shared ledger · View only")
        #expect(presentation.subtitle(GuestFixtures.household) == "Shared by Tomas · View only")
    }

    @Test("a ledger row says who paid and prints the figure without a sign")
    func ledgerRowsCarryDirectionInWords() {
        let account = ledger(0)

        #expect(presentation.amount(entry(-6_200, .purchase), in: account) == "$62.00")
        #expect(presentation.kindLabel(entry(-6_200, .purchase), in: account) == "I paid for Tomas")
        #expect(presentation.kindLabel(entry(8_412, .refund), in: account) == "Tomas paid for me")
        #expect(
            presentation.kindLabel(entry(-15_000, .transfer), in: account) == "I paid Tomas back")
        #expect(
            presentation.kindLabel(entry(15_000, .transfer), in: account) == "Tomas paid me back")
    }

    @Test("a row the form cannot express falls back to its stored type")
    func unlistedTypesAreNamedPlainly() {
        #expect(presentation.kindLabel(entry(500, .tax), in: ledger(0)) == "Tax")
        #expect(presentation.kindLabel(entry(500, .purchase), in: ledger(0)) == "Purchase")
    }

    @Test("a list row drops the year its own page keeps")
    func rowsDropTheYear() {
        let row = entry(-6_200, .purchase)

        #expect(presentation.rowSubtitle(row, in: ledger(0)) == "I paid for Tomas · 2 Oct")
        #expect(presentation.subtitle(row, in: ledger(0)) == "I paid for Tomas · 2 Oct 2026")
    }

    @Test("across accounts an ordinary row leads with its account, a ledger row with who paid")
    func mixedListRows() {
        let bill = GuestFixtures.householdEntries[0]
        let household = GuestFixtures.household

        #expect(
            presentation.rowSubtitle(bill, in: household, namingAccount: true)
                == "Household bills · 3 Oct")
        #expect(presentation.rowSubtitle(bill, in: household) == "Purchase · 3 Oct")
        #expect(
            presentation.rowSubtitle(entry(-6_200, .purchase), in: ledger(0), namingAccount: true)
                == "I paid for Tomas · 2 Oct")
    }

    @Test("an ordinary account's rows keep their sign")
    func ordinaryRowsKeepTheirSign() {
        let row = GuestFixtures.householdEntries[0]

        #expect(presentation.amount(row, in: GuestFixtures.household) == "-$186.40")
        #expect(presentation.kindLabel(row, in: GuestFixtures.household) == "Purchase")
    }
}
