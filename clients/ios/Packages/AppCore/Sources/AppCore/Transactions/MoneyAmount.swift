import Foundation

/// A monetary value as the number of minor units of its currency — 1999 `AUD`
/// is $19.99, 500 `JPY` is ¥500.
///
/// This mirrors how the finance pillar persists money (`pillars/finance/src/money.ts`
/// computes in integer cents and emits decimals only at the wire edge), so the
/// app never holds a binary float of someone's money and never re-derives a
/// sign convention. The single decimal conversion happens where the wire shape
/// is mapped, not on a screen.
public struct MoneyAmount: Hashable, Sendable {
    public let minorUnits: Int
    /// ISO 4217, as sent.
    public let currencyCode: String

    public init(minorUnits: Int, currencyCode: String) {
        self.minorUnits = minorUnits
        self.currencyCode = currencyCode
    }

    /// The value in major units, exactly — no floating point involved.
    public var decimalValue: Decimal {
        Decimal(minorUnits) / pow(10, Self.minorUnitDigits(for: currencyCode))
    }

    /// Formatted for display. The sign is whatever the server sent.
    public func formatted(locale: Locale = .autoupdatingCurrent) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        formatter.currencyCode = currencyCode
        return formatter.string(from: decimalValue as NSDecimalNumber)
            ?? "\(decimalValue) \(currencyCode)"
    }

    /// How many minor units make one major unit, which is a property of the
    /// currency and not of the reader's locale — yen has none, dinar has three.
    private static func minorUnitDigits(for currencyCode: String) -> Int {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.maximumFractionDigits
    }
}
