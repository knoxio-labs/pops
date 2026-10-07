import AppCore
import Foundation
import Testing

@testable import DesignPlayground

@Suite("Guest entry form")
internal struct GuestTransactionDraftTests {
    private let ledger = GuestFixtures.ledger
    private let day = Date(timeIntervalSince1970: 1_791_200_000)

    private var writable: [GuestAccount] { [GuestFixtures.ledger] }

    private func draft(amount: String = "62.00", description: String = "Dinner")
        -> GuestTransactionDraft
    {
        GuestTransactionDraft(
            accountID: ledger.id, kindID: GuestEntryKind.paidForOwner.id, date: day,
            amountText: amount, description: description)
    }

    @Test("the only writable account is chosen for the guest")
    func oneWritableAccountIsPreselected() {
        let blank = GuestTransactionDraft.blank(accounts: GuestFixtures.accounts, on: day)

        #expect(blank.accountID == ledger.id)
        #expect(blank.kindID == nil)
        #expect(blank.date == day)
    }

    @Test("two writable accounts leave the choice open, and none leaves nothing to choose")
    func otherCountsPreselectNothing() {
        let two = [GuestFixtures.ledger, GuestFixtures.householdEditable]

        #expect(GuestTransactionDraft.blank(accounts: two, on: day).accountID == nil)
        #expect(
            GuestTransactionDraft.blank(accounts: [GuestFixtures.household], on: day).accountID
                == nil)
        #expect(GuestTransactionDraft.blank(accounts: [], on: day).accountID == nil)
    }

    @Test(
        "an amount is a positive figure with at most two decimals",
        arguments: [("62", 6_200), ("62.5", 6_250), ("62.50", 6_250), ("0.01", 1), (" 7.10 ", 710)])
    func amountsThatParse(text: String, minorUnits: Int) {
        #expect(draft(amount: text).magnitude(currencyCode: "AUD")?.minorUnits == minorUnits)
    }

    @Test(
        "anything else is not an amount",
        arguments: ["", " ", "0", "0.00", "-5", "+5", "1.234", "1,50", "12abc", "1.2.3", ".", "٣"])
    func amountsThatDoNot(text: String) {
        #expect(draft(amount: text).magnitude(currencyCode: "AUD") == nil)
    }

    @Test("a blank form is missing everything it was not handed")
    func blankFormListsEveryGap() {
        let blank = GuestTransactionDraft.blank(accounts: writable, on: day)

        #expect(blank.missing(accounts: writable) == [.kind, .amount, .description])
        #expect(
            GuestTransactionDraft.blank(accounts: [], on: day).missing(accounts: [])
                == Set(GuestTransactionDraft.Field.allCases))
    }

    @Test("a complete form is missing nothing, and whitespace is not a description")
    func completeAndBlankDescription() {
        #expect(draft().missing(accounts: writable).isEmpty)
        #expect(draft(description: "  \n").missing(accounts: writable) == [.description])
    }

    @Test("a view-only account cannot be written to, whatever the draft says")
    func viewRoleIsNeverATarget() {
        let viewOnly = [GuestFixtures.ledgerViewOnly]

        #expect(draft().account(in: viewOnly) == nil)
        #expect(draft().missing(accounts: viewOnly).contains(.account))
        #expect(draft().signedAmount(accounts: viewOnly) == nil)
    }

    @Test("the type decides the sign the ledger stores")
    func typeDecidesTheSign() {
        var entry = draft()
        #expect(entry.signedAmount(accounts: writable)?.minorUnits == -6_200)

        entry.kindID = GuestEntryKind.ownerPaidForMe.id
        #expect(entry.signedAmount(accounts: writable)?.minorUnits == 6_200)

        entry.kindID = GuestEntryKind.purchase.id
        #expect(entry.signedAmount(accounts: writable) == nil)
    }

    @Test("moving to an account that lacks the chosen type clears it")
    func choosingAnAccountResetsAForeignType() {
        var entry = draft()

        entry.choose(GuestFixtures.householdEditable)
        #expect(entry.accountID == GuestFixtures.household.id)
        #expect(entry.kindID == nil)

        entry.kindID = GuestEntryKind.refund.id
        entry.choose(GuestFixtures.householdEditable)
        #expect(entry.kindID == GuestEntryKind.refund.id)
    }

    @Test("editing opens on the row's own values, unsigned")
    func editingPrefills() {
        let editing = GuestTransactionDraft.editing(GuestFixtures.dinner, in: ledger)

        #expect(editing.amountText == "62.00")
        #expect(editing.kindID == GuestEntryKind.paidForOwner.id)
        #expect(editing.description == "Dinner at Bar Lucia")
        #expect(editing.missing(accounts: writable).isEmpty)
    }

    @Test("a row the form cannot express opens with its type unchosen")
    func editingAnUnlistedTypeLeavesTypeOpen() {
        let tax = GuestEntry(
            id: "txn-tax", accountID: ledger.id, description: "Levy",
            amount: MoneyAmount(minorUnits: 500, currencyCode: "AUD"), date: day, type: .tax)

        let editing = GuestTransactionDraft.editing(tax, in: ledger)

        #expect(editing.kindID == nil)
        #expect(editing.missing(accounts: writable) == [.kind])
    }

    @Test("a receipt's reading overwrites date, description and amount")
    func suggestionFillsTheForm() {
        let applied = draft().applying(GuestFixtures.receiptSuggestion, accounts: writable)

        #expect(applied.amountText == "84.12")
        #expect(applied.description == "Harris Farm Markets")
        #expect(applied.date == GuestFixtures.receiptSuggestion.date)
        #expect(applied.kindID == GuestEntryKind.paidForOwner.id)
    }

    @Test("a total in another currency is never copied across")
    func foreignTotalIsWithheld() {
        let suggestion = GuestFixtures.foreignSuggestion
        let applied = draft().applying(suggestion, accounts: writable)

        #expect(suggestion.currencyMismatch(with: "AUD"))
        #expect(applied.amountText == "62.00")
        #expect(applied.description == "Pastelaria Santo Antonio")
    }

    @Test("what the reading did not find leaves what was typed alone")
    func partialSuggestionKeepsTypedValues() {
        let applied = draft().applying(GuestFixtures.partialSuggestion, accounts: writable)

        #expect(applied.date == day)
        #expect(applied.amountText == "84.12")
    }

    @Test("an unknown currency on either side is not a mismatch")
    func mismatchNeedsBothSides() {
        #expect(!GuestFixtures.receiptSuggestion.currencyMismatch(with: "AUD"))
        #expect(!GuestFixtures.foreignSuggestion.currencyMismatch(with: nil))
        #expect(
            !GuestReceiptSuggestion(date: nil, description: nil, total: nil)
                .currencyMismatch(with: "AUD"))
    }

    @Test("only a failure that can answer differently offers another try")
    func retryOnlyWhereItCanHelp() {
        #expect(GuestSaveFailure.offline.isRetryable)
        #expect(GuestSaveFailure.unreachable.isRetryable)
        #expect(!GuestSaveFailure.accessRevoked.isRetryable)
        #expect(!GuestSaveFailure.readOnly.isRetryable)
    }
}
