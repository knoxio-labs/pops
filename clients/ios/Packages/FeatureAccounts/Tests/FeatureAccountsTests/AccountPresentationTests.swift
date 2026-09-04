import AppCore
import Foundation
import Testing

@testable import FeatureAccounts

/// Mirrors `pillars/design/src/kit/ios-account-balance.ts`'s own test
/// coverage: the sign of the balance drives the tone directly, a `side:
/// either` account gets the counterparty note, and points never take a money
/// tone regardless of sign.
@Suite("Account presentation")
internal struct AccountPresentationTests {
    private let presentation = AccountPresentation(locale: Locale(identifier: "en_AU"))

    @Test("a positive balance reads as the positive tone")
    func positiveBalance() {
        let account = Account.fake(balance: MoneyAmount(minorUnits: 500, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).tone == .positive)
    }

    @Test("a negative balance reads as the negative tone")
    func negativeBalance() {
        let account = Account.fake(balance: MoneyAmount(minorUnits: -500, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).tone == .negative)
    }

    @Test("a zero balance is neutral")
    func zeroBalance() {
        let account = Account.fake(balance: MoneyAmount(minorUnits: 0, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).tone == .neutral)
    }

    @Test("a person ledger in credit says who owes whom")
    func personLedgerPositive() {
        let account = Account.fake(
            kind: .person, balance: MoneyAmount(minorUnits: 500, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).note == "owed to you")
    }

    @Test("a person ledger in debt says the other way")
    func personLedgerNegative() {
        let account = Account.fake(
            kind: .person, balance: MoneyAmount(minorUnits: -500, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).note == "you owe")
    }

    @Test("a settled person ledger carries no counterparty note")
    func personLedgerSettled() {
        let account = Account.fake(
            kind: .person, balance: MoneyAmount(minorUnits: 0, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).note == nil)
    }

    @Test("a non-ledger kind carries no counterparty note even in debt")
    func nonLedgerKindHasNoNote() {
        let account = Account.fake(
            kind: .creditCard, balance: MoneyAmount(minorUnits: -500, currencyCode: "AUD"))

        #expect(presentation.readBalance(account).note == nil)
    }

    @Test("points never take a money tone, whatever their sign")
    func pointsAreAlwaysNeutral() {
        let negative = Account.fake(
            kind: .other, balance: MoneyAmount(minorUnits: -500, currencyCode: "MR"))
        let positive = Account.fake(
            kind: .other, balance: MoneyAmount(minorUnits: 500, currencyCode: "MR"))

        #expect(presentation.readBalance(negative).tone == .neutral)
        #expect(presentation.readBalance(positive).tone == .neutral)
    }

    @Test("a checkpointed balance says when it was last confirmed")
    func asOfNoteWithCheckpoint() {
        let account = Account.fake(balanceAsOf: Date(timeIntervalSince1970: 0))

        #expect(presentation.asOfNote(account).hasPrefix("As of"))
    }

    @Test("an uncheckpointable kind with no checkpoint says it is derived")
    func asOfNoteDerived() {
        let account = Account.fake(kind: .cash, balanceAsOf: nil)

        #expect(presentation.asOfNote(account) == "Derived from transactions")
    }

    @Test("a checkpointable kind that has never been checked says so")
    func asOfNoteNeverChecked() {
        let account = Account.fake(kind: .checking, balanceAsOf: nil)

        #expect(presentation.asOfNote(account) == "Never checked against a statement")
    }

    @Test("the subtitle prefers the institution over the contact and the kind")
    func subtitlePrefersInstitution() {
        let account = Account.fake(institutionName: "ANZ", contact: "Someone")

        #expect(presentation.subtitle(account, kindLabel: "Checking") == "ANZ")
    }

    @Test("the subtitle falls back to the contact when there is no institution")
    func subtitleFallsBackToContact() {
        let account = Account.fake(institutionName: nil, contact: "Marta")

        #expect(presentation.subtitle(account, kindLabel: "Person") == "Marta")
    }

    @Test("the subtitle falls back to the kind label when neither is present")
    func subtitleFallsBackToKindLabel() {
        let account = Account.fake(institutionName: nil, contact: nil)

        #expect(presentation.subtitle(account, kindLabel: "Cash") == "Cash")
    }
}
