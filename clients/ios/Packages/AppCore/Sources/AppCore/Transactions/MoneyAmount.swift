import Foundation
import Synchronization

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

    /// The inverse of ``decimalValue``: an amount from a value in major units,
    /// which is the shape a wire that carries decimals delivers.
    ///
    /// It lives here rather than at the mapping site because the minor-unit
    /// table is here. A caller that scaled the value itself would be a second
    /// opinion about how many cents a currency has, and the two would only ever
    /// disagree about somebody's money.
    ///
    /// - Returns: `nil` when the value is not a whole number of minor units, or
    ///   is too large to be one. Failing rather than rounding is the point: a
    ///   currency with two minor digits has no representation for `1.005`, and
    ///   silently picking `1.00` or `1.01` would be this app inventing a
    ///   rounding rule the pillar that owns the money never agreed to. The
    ///   caller reports it as a contract mismatch, which is what it is.
    public init?(majorUnits: Decimal, currencyCode: String) {
        var scaled = majorUnits * pow(10, Self.minorUnitDigits(for: currencyCode))
        var whole = Decimal()
        NSDecimalRound(&whole, &scaled, 0, .plain)

        // `description` rather than `intValue`: `NSDecimalNumber` converts
        // through a `Double` on its way to an `Int`, which reintroduces exactly
        // the binary float this type exists to keep out. Base-10 digits parsed
        // by `Int.init(_:)` are exact and answer `nil` on overflow.
        guard whole == scaled, let minorUnits = Int(whole.description) else { return nil }

        self.init(minorUnits: minorUnits, currencyCode: currencyCode)
    }

    /// The value in major units, exactly — no floating point involved.
    public var decimalValue: Decimal {
        Decimal(minorUnits) / pow(10, Self.minorUnitDigits(for: currencyCode))
    }

    /// Formatted for display. The sign is whatever the server sent.
    public func formatted(locale: Locale = .autoupdatingCurrent) -> String {
        decimalValue.formatted(.currency(code: currencyCode).locale(locale))
    }

    /// How many minor units make one major unit, which is a property of the
    /// currency and not of the reader's locale — yen has none, dinar has three.
    ///
    /// Cached because a `NumberFormatter` costs far more to build than a row
    /// costs to draw, and a scrolling list asks this of every row it renders.
    private static func minorUnitDigits(for currencyCode: String) -> Int {
        minorUnitDigitsByCurrency.withLock { cache in
            if let cached = cache[currencyCode] { return cached }
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.currencyCode = currencyCode
            cache[currencyCode] = formatter.maximumFractionDigits
            return formatter.maximumFractionDigits
        }
    }
}

private let minorUnitDigitsByCurrency = Mutex<[String: Int]>([:])
