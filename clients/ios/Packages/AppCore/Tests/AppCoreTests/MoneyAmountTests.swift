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
