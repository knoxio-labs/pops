import Foundation

/// One symbol of a unit term raised to a non-zero integer power.
internal struct InventoryUnitFactor: Hashable, Sendable {
    let symbol: String
    var power: Int
}

/// `measurement-units.ts`: which unit symbols have a known dimension, how
/// they convert (always by a power of ten), and the unit-term grammar derived
/// units are written in (`cm²`, `kg/m³`). Symbols compare by UTF-16 code
/// unit, as the server's strings do, never by canonical equivalence.
internal enum InventoryMeasurementUnits {
    /// A dimension as base-dimension exponents keyed by the base's UTF-16
    /// code units; absent keys are zero.
    typealias Dimension = [[UInt16]: Int]

    private struct Known {
        let symbol: String
        let dimension: [String: Int]
        let powerOfTen: Int
    }

    private static let known: [Known] = [
        Known(symbol: "mm", dimension: ["length": 1], powerOfTen: -3),
        Known(symbol: "cm", dimension: ["length": 1], powerOfTen: -2),
        Known(symbol: "m", dimension: ["length": 1], powerOfTen: 0),
        Known(symbol: "kg", dimension: ["mass": 1], powerOfTen: 0),
        Known(symbol: "L", dimension: ["length": 3], powerOfTen: -3),
        Known(symbol: "W", dimension: ["power": 1], powerOfTen: 0),
        Known(symbol: "V", dimension: ["voltage": 1], powerOfTen: 0),
        Known(symbol: "Gbps", dimension: ["data-rate": 1], powerOfTen: 0),
        Known(symbol: "lm", dimension: ["brightness": 1], powerOfTen: 0),
        Known(symbol: "K", dimension: ["colour-temperature": 1], powerOfTen: 0),
    ]

    private static let superscriptDigits: [Unicode.Scalar] = [
        "\u{2070}", "\u{00B9}", "\u{00B2}", "\u{00B3}", "\u{2074}",
        "\u{2075}", "\u{2076}", "\u{2077}", "\u{2078}", "\u{2079}",
    ]
    private static let middleDot: Unicode.Scalar = "\u{00B7}"
    private static let slash: Unicode.Scalar = "/"
    private static let superscriptMinus: Unicode.Scalar = "\u{207B}"
    /// JavaScript's `\s`, which the server's grammar excludes from symbols.
    private static let whitespace: Set<UInt32> = Set(
        [
            0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F,
            0x3000,
            0xFEFF,
        ] + Array(0x2000...0x200A))

    private static func known(_ symbol: String) -> Known? {
        known.first { $0.symbol.wireEquals(symbol) }
    }

    private static func digit(_ scalar: Unicode.Scalar) -> Int? {
        superscriptDigits.firstIndex(of: scalar)
    }

    private static func superscript(_ power: Int) -> String {
        if power == 1 { return "" }
        var text = ""
        for character in String(power) {
            guard let value = character.wholeNumberValue else { continue }
            text.unicodeScalars.append(superscriptDigits[value])
        }
        return text
    }

    private static func isReserved(_ scalar: Unicode.Scalar) -> Bool {
        scalar == middleDot || scalar == slash || scalar == superscriptMinus
            || digit(scalar) != nil || whitespace.contains(scalar.value)
    }

    private static func factor(_ scalars: [Unicode.Scalar], sign: Int) -> InventoryUnitFactor? {
        var split = scalars.count
        while split > 0, digit(scalars[split - 1]) != nil { split -= 1 }
        var symbol = ""
        symbol.unicodeScalars.append(contentsOf: scalars[..<split])
        let exponent = scalars[split...]
        guard !symbol.isEmpty, !symbol.wireEquals("1"),
            !scalars[..<split].contains(where: isReserved)
        else { return nil }
        if exponent.isEmpty { return InventoryUnitFactor(symbol: symbol, power: sign) }
        guard exponent.count <= 2 else { return nil }
        let power = exponent.reduce(0) { $0 * 10 + (digit($1) ?? 0) }
        var written = ""
        written.unicodeScalars.append(contentsOf: exponent)
        guard power >= 2, superscript(power).wireEquals(written) else { return nil }
        return InventoryUnitFactor(symbol: symbol, power: sign * power)
    }

    private static func product(_ scalars: ArraySlice<Unicode.Scalar>, sign: Int)
        -> [InventoryUnitFactor]?
    {
        var factors: [InventoryUnitFactor] = []
        for part in scalars.split(separator: middleDot, omittingEmptySubsequences: false) {
            guard let parsed = factor(Array(part), sign: sign) else { return nil }
            factors.append(parsed)
        }
        return factors
    }

    /// The canonical unit-term grammar `parseUnitTerm` reads, or nil for any
    /// other text (still a valid fixed unit, just not one arithmetic derives).
    static func parseTerm(_ unit: String) -> [InventoryUnitFactor]? {
        let scalars = Array(unit.unicodeScalars)
        let parts = scalars.split(separator: slash, omittingEmptySubsequences: false)
        guard let numerator = parts.first, parts.count <= 2 else { return nil }
        let positive: [InventoryUnitFactor]?
        if parts.count == 2, numerator.count == 1, numerator.first == "1" {
            positive = []
        } else {
            positive = product(numerator, sign: 1)
        }
        let negative = parts.count == 2 ? product(parts[1], sign: -1) : []
        guard let positive, let negative else { return nil }
        let factors = positive + negative
        let symbols = Set(factors.map { Array($0.symbol.utf16) })
        return factors.isEmpty || symbols.count != factors.count ? nil : factors
    }

    /// Writes a non-empty term in the canonical grammar.
    static func format(_ term: [InventoryUnitFactor]) -> String {
        func product(_ factors: [InventoryUnitFactor]) -> String {
            factors.map { $0.symbol + superscript(abs($0.power)) }.joined(separator: "·")
        }
        let numerator = term.filter { $0.power > 0 }
        let denominator = term.filter { $0.power < 0 }
        let top = numerator.isEmpty ? "1" : product(numerator)
        return denominator.isEmpty ? top : top + "/" + product(denominator)
    }

    private static func symbolDimension(_ symbol: String) -> Dimension {
        guard let unit = known(symbol) else { return [Array(("unit:" + symbol).utf16): 1] }
        return Dictionary(
            uniqueKeysWithValues: unit.dimension.map { (Array($0.key.utf16), $0.value) })
    }

    static func dimension(of term: [InventoryUnitFactor]) -> Dimension {
        var dimension: Dimension = [:]
        for factor in term {
            for (base, exponent) in symbolDimension(factor.symbol) {
                let next = (dimension[base] ?? 0) + exponent * factor.power
                dimension[base] = next == 0 ? nil : next
            }
        }
        return dimension
    }

    /// The dimension of any fixed unit; text that is not a term is its own.
    static func dimension(ofUnit unit: String) -> Dimension {
        guard let term = parseTerm(unit) else { return [Array(("opaque:" + unit).utf16): 1] }
        return dimension(of: term)
    }

    static func powerOfTen(_ term: [InventoryUnitFactor]) -> Int {
        term.reduce(0) { $0 + $1.power * (known($1.symbol)?.powerOfTen ?? 0) }
    }

    /// `unitConversionShift`: `amountTo = amountFrom × 10^shift`, or nil
    /// across dimensions.
    static func conversionShift(from: String, to: String) -> Int? {
        if from.wireEquals(to) { return 0 }
        guard let source = parseTerm(from), let target = parseTerm(to),
            dimension(of: source) == dimension(of: target)
        else { return nil }
        return powerOfTen(source) - powerOfTen(target)
    }

    private static func sameKnownDimension(_ left: String, _ right: String) -> Bool {
        known(left) != nil && known(right) != nil && symbolDimension(left) == symbolDimension(right)
    }

    /// `combineUnits`: the product (`sign` 1) or quotient (-1) of two unit
    /// terms, and the shift that converts the right amount into the symbols
    /// it merged with; nil when either is not a term.
    static func combine(_ left: String, _ right: String, sign: Int)
        -> (term: [InventoryUnitFactor], rightShift: Int)?
    {
        guard var factors = parseTerm(left), let rightTerm = parseTerm(right) else { return nil }
        var rightShift = 0
        for factor in rightTerm {
            let same = factors.firstIndex { $0.symbol.wireEquals(factor.symbol) }
            let index =
                same ?? factors.firstIndex { sameKnownDimension($0.symbol, factor.symbol) }
            guard let index else {
                factors.append(
                    InventoryUnitFactor(symbol: factor.symbol, power: sign * factor.power))
                continue
            }
            if same == nil {
                rightShift +=
                    factor.power
                    * ((known(factor.symbol)?.powerOfTen ?? 0)
                        - (known(factors[index].symbol)?.powerOfTen ?? 0))
            }
            factors[index].power += sign * factor.power
        }
        return (factors.filter { $0.power != 0 }, rightShift)
    }
}
