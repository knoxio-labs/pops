import AppCore
import Foundation
import Testing

@testable import FeatureTransactions

/// What a row says, in text — which is also what VoiceOver reads, since the row
/// hands it this same sentence.
///
/// Locale and time zone are pinned in every test here. A formatting test that
/// reads the machine's own is a test that passes in Sydney and fails on a CI
/// runner in UTC, and the fix people reach for is deleting the assertion.
@Suite("Transaction presentation")
internal struct TransactionPresentationTests {
    private let australian = TransactionPresentation(
        locale: Locale(identifier: "en_AU"),
        timeZone: TimeZone(identifier: "Australia/Sydney") ?? .gmt
    )

    private func transaction(
        description: String = "Flat white",
        minorUnits: Int = -540,
        date: Date = Date(timeIntervalSince1970: 0),
        type: TransactionType = .purchase,
        entityName: String? = "Sample Coffee",
        tags: [String] = ["coffee"]
    ) -> Transaction {
        Transaction(
            id: "txn-1",
            description: description,
            amount: MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD"),
            date: date,
            type: type,
            entityName: entityName,
            tags: tags
        )
    }

    @Test("the amount follows the reader's locale")
    func amountFollowsLocale() {
        let row = transaction(minorUnits: 123_456)
        let german = TransactionPresentation(locale: Locale(identifier: "de_DE"), timeZone: .gmt)

        #expect(australian.amount(row) != german.amount(row))
        #expect(australian.amount(row).contains("1,234.56"))
        #expect(german.amount(row).contains("1.234,56"))
    }

    /// The currency is the server's, and the reader's locale does not get to
    /// change it. A German reader looking at Australian dollars is looking at
    /// Australian dollars.
    @Test("the currency comes from the transaction, not from the locale")
    func currencyIsNotLocalised() {
        let german = TransactionPresentation(locale: Locale(identifier: "de_DE"), timeZone: .gmt)

        #expect(!german.amount(transaction(minorUnits: 123_456)).contains("€"))
    }

    @Test("the sign is the one the server sent")
    func signIsCarried() {
        #expect(australian.amount(transaction(minorUnits: -540)).contains("5.40"))
        #expect(
            australian.amount(transaction(minorUnits: -540))
                != australian.amount(transaction(minorUnits: 540)))
    }

    /// The instant is the same; only the zone differs. If the zone were not
    /// reaching the formatter, both would read the same day.
    @Test("the date is rendered in the reader's time zone")
    func dateFollowsTimeZone() {
        let row = transaction(date: Date(timeIntervalSince1970: 0))
        let losAngeles = TransactionPresentation(
            locale: Locale(identifier: "en_AU"),
            timeZone: TimeZone(identifier: "America/Los_Angeles") ?? .gmt
        )

        #expect(australian.date(row).contains("1970"))
        #expect(losAngeles.date(row).contains("1969"))
    }

    @Test("the date is rendered in the reader's locale")
    func dateFollowsLocale() {
        let row = transaction(date: Date(timeIntervalSince1970: 0))
        let german = TransactionPresentation(locale: Locale(identifier: "de_DE"), timeZone: .gmt)
        let utcAustralian = TransactionPresentation(
            locale: Locale(identifier: "en_AU"), timeZone: .gmt)

        #expect(german.date(row) != utcAustralian.date(row))
    }

    @Test("the subtitle names who it was with and when")
    func subtitleCarriesEntityAndDate() {
        let row = transaction(entityName: "Sample Coffee")

        let subtitle = australian.subtitle(row)

        #expect(subtitle.hasPrefix("Sample Coffee"))
        #expect(subtitle.contains(australian.date(row)))
    }

    /// Most transactions have an entity and some do not. A dash where the name
    /// would be is noise on every row that lacks one.
    @Test("a transaction with no entity is just a date, not a placeholder")
    func subtitleWithoutAnEntity() {
        let row = transaction(entityName: nil)

        #expect(australian.subtitle(row) == australian.date(row))
    }

    @Test("the caption carries the type and the tags")
    func captionCarriesTypeAndTags() {
        let row = transaction(type: .refund, tags: ["groceries", "weekly"])

        #expect(australian.caption(row) == "refund · groceries · weekly")
    }

    @Test("a transaction with no tags still says what kind it is")
    func captionWithoutTags() {
        #expect(australian.caption(transaction(type: .income, tags: [])) == "income")
    }

    /// VoiceOver reads a row as one utterance. A list of fragments is not a
    /// sentence, and the separator has to be one every voice announces.
    @Test("the accessibility label is one sentence carrying every field")
    func accessibilityLabelIsASentence() {
        let row = transaction(
            description: "Flat white",
            type: .purchase,
            entityName: "Sample Coffee",
            tags: ["coffee"]
        )

        let label = australian.accessibilityLabel(row)

        #expect(label.hasPrefix("Flat white, "))
        #expect(label.contains(australian.amount(row)))
        #expect(label.contains(australian.date(row)))
        #expect(label.contains("Sample Coffee"))
        #expect(label.contains("purchase"))
        #expect(label.contains("tagged coffee"))
        #expect(!label.contains(" · "))
    }

    @Test("the label drops what the transaction does not have")
    func accessibilityLabelOmitsAbsentFields() {
        let label = australian.accessibilityLabel(transaction(entityName: nil, tags: []))

        #expect(!label.contains("tagged"))
        #expect(!label.contains("Sample Coffee"))
        #expect(label.contains("purchase"))
    }

    @Test("only money arriving counts as a credit")
    func creditsAreMoneyArriving() {
        #expect(australian.isCredit(transaction(minorUnits: 420_000)))
        #expect(!australian.isCredit(transaction(minorUnits: -540)))
        #expect(!australian.isCredit(transaction(minorUnits: 0)))
    }
}
