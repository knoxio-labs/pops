import AppCore
import Foundation
import Testing

@Suite("Money")
internal struct MoneyAmountTests {
    @Test("a two-digit currency converts minor units to major")
    func twoDigitCurrency() {
        let amount = MoneyAmount(minorUnits: 1999, currencyCode: "AUD")

        #expect(amount.decimalValue == Decimal(string: "19.99"))
    }

    @Test("a currency with no minor units does not gain a fraction")
    func zeroDigitCurrency() {
        let amount = MoneyAmount(minorUnits: 500, currencyCode: "JPY")

        #expect(amount.decimalValue == Decimal(500))
    }

    @Test("a three-digit currency keeps all three")
    func threeDigitCurrency() {
        let amount = MoneyAmount(minorUnits: 1234, currencyCode: "KWD")

        #expect(amount.decimalValue == Decimal(string: "1.234"))
    }

    @Test("the sign is carried, never re-derived")
    func negativeAmount() {
        let amount = MoneyAmount(minorUnits: -1999, currencyCode: "AUD")

        #expect(amount.decimalValue == Decimal(string: "-19.99"))
        #expect(amount.formatted(locale: Locale(identifier: "en_AU")).contains("19.99"))
        #expect(amount.formatted(locale: Locale(identifier: "en_AU")).contains("-"))
    }

    @Test("zero is zero in every currency")
    func zeroAmount() {
        #expect(MoneyAmount(minorUnits: 0, currencyCode: "AUD").decimalValue == Decimal(0))
        #expect(MoneyAmount(minorUnits: 0, currencyCode: "JPY").decimalValue == Decimal(0))
    }

    @Test("formatting follows the reader's locale, not the currency's country")
    func formattingFollowsLocale() {
        let amount = MoneyAmount(minorUnits: 123_456, currencyCode: "AUD")

        let german = amount.formatted(locale: Locale(identifier: "de_DE"))
        let australian = amount.formatted(locale: Locale(identifier: "en_AU"))

        #expect(german.contains("1.234,56"))
        #expect(australian.contains("1,234.56"))
    }

    @Test("an unrecognised currency code still renders the number")
    func unknownCurrencyCode() {
        let amount = MoneyAmount(minorUnits: 1999, currencyCode: "ZZZ")

        #expect(amount.formatted(locale: Locale(identifier: "en_AU")).contains("19.99"))
    }

    @Test("no floating point is involved")
    func exactArithmetic() {
        let tenCents = MoneyAmount(minorUnits: 10, currencyCode: "AUD").decimalValue
        let twentyCents = MoneyAmount(minorUnits: 20, currencyCode: "AUD").decimalValue

        #expect(
            tenCents + twentyCents == MoneyAmount(minorUnits: 30, currencyCode: "AUD").decimalValue)
    }
}

/// The wire-facing direction. Every value here is one a `Double` renders
/// inexactly, which is what the mapping this initialiser exists for receives.
@Suite("Money from major units")
internal struct MoneyFromMajorUnitsTests {
    private func amount(_ majorUnits: String, _ currencyCode: String) throws -> MoneyAmount {
        let decimal = try #require(Decimal(string: majorUnits))
        return try #require(MoneyAmount(majorUnits: decimal, currencyCode: currencyCode))
    }

    @Test(
        "a two-digit currency scales exactly",
        arguments: [
            ("19.99", 1999), ("0.07", 7), ("0", 0), ("1234567.89", 123_456_789),
        ]
    )
    func twoDigitCurrency(majorUnits: String, minorUnits: Int) throws {
        #expect(try amount(majorUnits, "AUD").minorUnits == minorUnits)
    }

    @Test("the sign survives, and is not re-derived from anything")
    func negativeAmounts() throws {
        #expect(try amount("-19.99", "AUD").minorUnits == -1999)
        #expect(try amount("-0.01", "AUD").minorUnits == -1)
    }

    @Test("a currency's own minor-unit count decides the scale")
    func currencyDecidesTheScale() throws {
        #expect(try amount("500", "JPY").minorUnits == 500)
        #expect(try amount("1.234", "KWD").minorUnits == 1234)
    }

    @Test("more precision than the currency has is refused, not rounded")
    func excessPrecisionIsRefused() throws {
        let subCent = try #require(Decimal(string: "1.005"))
        let subYen = try #require(Decimal(string: "0.5"))

        #expect(MoneyAmount(majorUnits: subCent, currencyCode: "AUD") == nil)
        #expect(MoneyAmount(majorUnits: subYen, currencyCode: "JPY") == nil)
    }

    @Test("a value too large to be an Int is refused rather than saturating")
    func overflowIsRefused() throws {
        let beyondInt64 = try #require(Decimal(string: "1e30"))

        #expect(MoneyAmount(majorUnits: beyondInt64, currencyCode: "AUD") == nil)
    }

    @Test("it is the exact inverse of decimalValue")
    func roundTripsThroughDecimalValue() throws {
        for minorUnits in [-123_456, -1, 0, 7, 1999, 987_654_321] {
            let original = MoneyAmount(minorUnits: minorUnits, currencyCode: "AUD")
            let restored = MoneyAmount(majorUnits: original.decimalValue, currencyCode: "AUD")

            #expect(restored == original)
        }
    }
}
