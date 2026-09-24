import Foundation

/// Why an expression could not produce a value even though every input was
/// available. The replica reports each as `evaluation_error`, as the server does.
public enum InventoryExpressionErrorCode: String, Error, Hashable, Sendable {
    case invalidValue = "invalid_value"
    case integerOverflow = "integer_overflow"
    case precisionOverflow = "precision_overflow"
    case divisionByZero = "division_by_zero"
}

/// `expression-arithmetic.ts`'s exact decimal: an integer coefficient and a
/// count of fractional digits, never a binary float. The server uses
/// unbounded integers; canonical inputs (18 significant digits, 9 places) keep
/// every intermediate under 10^37, which `Int128` holds, and a result wider
/// than 18 digits is `precision_overflow` there anyway, so an intermediate
/// that would overflow `Int128` is reported the same way.
internal struct InventoryExpressionDecimal {
    let coefficient: Int128
    let scale: Int

    static let maximumScale = 9
    static let maximumSignificantDigits = 18

    /// `^(-?)(\d+)(?:\.(\d+))?$`, the server's arithmetic parse, which is laxer
    /// than the canonical grammar (it admits leading zeros).
    init?(_ text: String) {
        var digits = Substring(text)
        let negative = digits.first == "-"
        if negative { digits = digits.dropFirst() }
        let parts = digits.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let whole = parts.first, !whole.isEmpty, whole.allSatisfy(\.isASCIIDigit) else {
            return nil
        }
        let fraction = parts.count == 2 ? parts[1] : ""
        guard parts.count == 1 || !fraction.isEmpty, fraction.allSatisfy(\.isASCIIDigit),
            let magnitude = Int128(String(whole) + String(fraction))
        else { return nil }
        self.coefficient = negative ? -magnitude : magnitude
        self.scale = fraction.count
    }

    init(coefficient: Int128, scale: Int) {
        self.coefficient = coefficient
        self.scale = scale
    }

    /// The canonical text of this value, or the server's precision failure.
    var text: Result<String, InventoryExpressionErrorCode> {
        let magnitude = String(coefficient.magnitude)
        let digits = String(repeating: "0", count: max(0, scale + 1 - magnitude.count)) + magnitude
        let significant = digits.drop(while: { $0 == "0" }).count
        guard scale <= Self.maximumScale, significant <= Self.maximumSignificantDigits else {
            return .failure(.precisionOverflow)
        }
        let whole = digits.dropLast(scale)
        let fraction = scale == 0 ? "" : "." + digits.suffix(scale)
        return .success((coefficient < 0 ? "-" : "") + whole + fraction)
    }

    static func power(_ exponent: Int) -> Int128? {
        var result: Int128 = 1
        for _ in 0..<exponent {
            let (next, overflow) = result.multipliedReportingOverflow(by: 10)
            if overflow { return nil }
            result = next
        }
        return result
    }

    /// Both coefficients at the wider of the two scales.
    static func aligned(_ left: Self, _ right: Self) -> (left: Self, right: Self)? {
        let scale = max(left.scale, right.scale)
        guard let leftCoefficient = left.coefficient.times(power(scale - left.scale)),
            let rightCoefficient = right.coefficient.times(power(scale - right.scale))
        else { return nil }
        return (
            Self(coefficient: leftCoefficient, scale: scale),
            Self(coefficient: rightCoefficient, scale: scale)
        )
    }

    /// The smallest scale up to 9 at which the quotient is exact.
    static func divided(_ left: Self, by right: Self) -> Result<
        String, InventoryExpressionErrorCode
    > {
        if right.coefficient == 0 { return .failure(.divisionByZero) }
        guard let numerator = left.coefficient.times(power(right.scale)),
            let denominator = right.coefficient.times(power(left.scale))
        else { return .failure(.precisionOverflow) }
        for scale in 0...maximumScale {
            guard let scaled = numerator.times(power(scale)) else {
                return .failure(.precisionOverflow)
            }
            if scaled % denominator == 0 {
                return Self(coefficient: scaled / denominator, scale: scale).text
            }
        }
        return .failure(.precisionOverflow)
    }
}

extension Int128 {
    /// The product, or nil on overflow or a missing factor.
    fileprivate func times(_ factor: Int128?) -> Int128? {
        guard let factor else { return nil }
        let (product, overflow) = multipliedReportingOverflow(by: factor)
        return overflow ? nil : product
    }
}

extension Character {
    fileprivate var isASCIIDigit: Bool { isASCII && isNumber }
}
