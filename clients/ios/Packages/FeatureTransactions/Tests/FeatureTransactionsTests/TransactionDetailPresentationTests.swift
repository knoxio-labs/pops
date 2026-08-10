import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureTransactions

/// What the detail screen says, pinned to a locale and a time zone so the
/// answer is the same in Sydney and on a UTC runner.
@Suite("Transaction detail presentation")
internal struct TransactionDetailPresentationTests {
    private static let presentation = TransactionDetailPresentation(
        locale: Locale(identifier: "en_AU"),
        timeZone: TimeZone(identifier: "Australia/Sydney") ?? .gmt
    )

    private static func labels(_ content: TransactionDetailContent) -> [String] {
        content.fields.map(\.label)
    }

    private static func value(
        _ label: String,
        in content: TransactionDetailContent
    ) -> String? {
        content.fields.first { $0.label == label }?.value
    }

    @Test("the fuller record draws every field finance sent")
    func theRecordDrawsEverything() {
        let content = Self.presentation.content(TransactionDetail.fake())

        #expect(
            Self.labels(content) == [
                TransactionsCopy.FieldLabel.type,
                TransactionsCopy.FieldLabel.entity,
                TransactionsCopy.FieldLabel.tags,
                TransactionsCopy.FieldLabel.account,
                TransactionsCopy.FieldLabel.location,
                TransactionsCopy.FieldLabel.country,
                TransactionsCopy.FieldLabel.notes,
                TransactionsCopy.FieldLabel.lastEdited,
            ]
        )
    }

    /// The seed is a subset, not a different screen. The three lines it can
    /// fill are the three the record puts first, so nothing the reader was
    /// already looking at moves when the rest arrive.
    @Test("a seeded row draws the fields it has, in the order the record uses")
    func aSeedIsAPrefixOfTheRecord() {
        let seeded = Self.presentation.content(Transaction.fake(entityName: "Sample", tags: ["a"]))
        let full = Self.presentation.content(TransactionDetail.fake())

        #expect(Self.labels(seeded) == Array(Self.labels(full).prefix(3)))
    }

    /// A field finance has nothing for is dropped, not drawn as a dash. A
    /// screen padded out with empty labels reads as one that failed to load.
    @Test("a field finance has nothing for is not drawn")
    func absentFieldsAreDropped() {
        let content = Self.presentation.content(
            TransactionDetail.fake(
                entityName: nil, tags: [], location: nil, country: nil, notes: nil))

        #expect(
            Self.labels(content) == [
                TransactionsCopy.FieldLabel.type,
                TransactionsCopy.FieldLabel.account,
                TransactionsCopy.FieldLabel.lastEdited,
            ]
        )
    }

    /// Finance stores free text. A notes column holding a newline is not a
    /// note — it is a label with a blank beside it, which reads as breakage.
    @Test("a field holding only whitespace is not drawn")
    func whitespaceIsNotAValue() {
        let content = Self.presentation.content(TransactionDetail.fake(notes: "   \n "))

        #expect(!Self.labels(content).contains(TransactionsCopy.FieldLabel.notes))
    }

    @Test("tags are joined into one line")
    func tagsAreOneLine() {
        let content = Self.presentation.content(TransactionDetail.fake(tags: ["coffee", "weekly"]))

        #expect(Self.value(TransactionsCopy.FieldLabel.tags, in: content) == "coffee, weekly")
    }

    /// The type is finance's raw string on purpose: a type this build has never
    /// heard of has to render as itself rather than as a blank or a fallback.
    @Test("a transaction type this build does not know still reads as itself")
    func unknownTypesRenderPlainly() {
        let content = Self.presentation.content(
            TransactionDetail.fake(type: TransactionType(rawValue: "escrow")))

        #expect(Self.value(TransactionsCopy.FieldLabel.type, in: content) == "escrow")
    }

    /// Finance records when it last wrote a row, and two edits on one day are
    /// different edits. A bare date cannot say which, which is the whole reason
    /// this one field is formatted with a clock time.
    ///
    /// Asserted as the property rather than against a formatted string: two
    /// instants that render the same date must render different timestamps.
    /// That holds whatever ICU decides "5 Aug 2026, 5:06 pm" looks like.
    @Test("last edited tells two edits on the same day apart")
    func lastEditedCarriesAClockTime() {
        // 2026-08-06, six hours apart, both in Australia/Sydney's day.
        let afternoon = Date(timeIntervalSince1970: 1_786_000_000)
        let evening = Date(timeIntervalSince1970: 1_786_021_600)
        let earlier = Self.presentation.content(
            TransactionDetail.fake(date: afternoon, lastEditedAt: afternoon))
        let later = Self.presentation.content(
            TransactionDetail.fake(date: afternoon, lastEditedAt: evening))
        let label = TransactionsCopy.FieldLabel.lastEdited

        #expect(earlier.date == later.date, "the fixtures are not on the same day")
        #expect(Self.value(label, in: earlier) != Self.value(label, in: later))
        #expect(Self.value(label, in: earlier) != earlier.date)
    }

    /// Money arriving is the only thing this app colours, and it is read off the
    /// amount the server sent rather than re-derived from the type.
    @Test("a credit is marked as one and a debit is not")
    func creditsAreMarked() {
        let credit = MoneyAmount(minorUnits: 540, currencyCode: "AUD")
        let debit = MoneyAmount(minorUnits: -540, currencyCode: "AUD")

        #expect(Self.presentation.content(TransactionDetail.fake(amount: credit)).isCredit)
        #expect(!Self.presentation.content(TransactionDetail.fake(amount: debit)).isCredit)
    }

    /// VoiceOver reads an element as one utterance. Three fragments do not
    /// parse as anything, and neither does a value announced apart from the
    /// label that says what it is.
    @Test("the heading reads as one sentence")
    func theHeadingIsASentence() {
        let content = Self.presentation.content(TransactionDetail.fake(description: "Flat white"))

        #expect(content.accessibilityLabel == "Flat white, \(content.amount), \(content.date)")
    }

    @Test("a field reads as its label and its value together")
    func aFieldIsASentence() {
        let field = TransactionDetailContent.Field(label: "Account", value: "Everyday")

        #expect(field.accessibilityLabel == "Account, Everyday")
    }

    /// `ForEach` needs an identity, and an index would re-identify every line
    /// below one that filled in — which is what makes a screen animate rows
    /// into each other when a fetch lands.
    @Test("every field on the screen is distinctly identified")
    func fieldsAreDistinctlyIdentified() {
        let ids = Self.presentation.content(TransactionDetail.fake()).fields.map(\.id)

        #expect(Set(ids).count == ids.count)
    }
}
