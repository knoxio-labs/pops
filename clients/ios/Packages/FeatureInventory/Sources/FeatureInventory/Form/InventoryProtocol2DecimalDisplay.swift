import AppCore

internal enum InventoryProtocol2DecimalDisplay {
    private struct DecimalParts {
        let negative: Bool
        let integer: String
        let fraction: [Character]
    }

    private struct RoundedParts {
        let integer: String
        let fraction: [Character]
    }

    internal static func format(_ text: String, field: InventoryCatalogueField) -> String {
        guard let places = decimalPlaces(in: field),
            let parsed = parsedParts(from: text)
        else { return text }
        let rounded = roundedParts(parsed, places: places)
        return signed(
            negative: parsed.negative, integer: rounded.integer, fraction: rounded.fraction)
    }

    private static func decimalPlaces(in field: InventoryCatalogueField) -> Int? {
        guard case .object(let presentation) = field.presentation,
            case .number(let raw)? = presentation["decimalPlaces"],
            raw.range(of: #"^[0-9]+$"#, options: .regularExpression) != nil,
            let places = Int(raw), (0...9).contains(places)
        else { return nil }
        return places
    }

    private static func parsedParts(
        from text: String
    ) -> DecimalParts? {
        let parts = text.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let whole = parts.first else { return nil }
        var integer = String(whole)
        let fraction = parts.count == 2 ? Array(parts[1]) : []
        let negative = integer.first == "-"
        if negative { integer.removeFirst() }
        return DecimalParts(negative: negative, integer: integer, fraction: fraction)
    }

    private static func roundedParts(
        _ parts: DecimalParts, places: Int
    ) -> RoundedParts {
        guard parts.fraction.count > places else {
            return RoundedParts(
                integer: parts.integer, fraction: padded(parts.fraction, to: places))
        }
        let discarded = parts.fraction[places]
        let fraction = Array(parts.fraction.prefix(places))
        guard discarded.wholeNumberValue ?? 0 >= 5 else {
            return RoundedParts(integer: parts.integer, fraction: padded(fraction, to: places))
        }
        return split(incremented(parts.integer + String(fraction)), places: places)
    }

    private static func padded(_ fraction: [Character], to places: Int) -> [Character] {
        fraction + repeatElement("0", count: places - fraction.count)
    }

    private static func incremented(_ value: String) -> String {
        var digits = Array(value.utf8).map { Int($0) - 48 }
        var index = digits.count - 1
        while index >= 0 && digits[index] == 9 {
            digits[index] = 0
            index -= 1
        }
        if index < 0 {
            digits.insert(1, at: 0)
        } else {
            digits[index] += 1
        }
        return digits.map(String.init).joined()
    }

    private static func split(
        _ coefficient: String, places: Int
    ) -> RoundedParts {
        guard places > 0 else { return RoundedParts(integer: coefficient, fraction: []) }
        return RoundedParts(
            integer: String(coefficient.dropLast(places)),
            fraction: Array(coefficient.suffix(places))
        )
    }

    private static func signed(
        negative: Bool, integer: String, fraction: [Character]
    ) -> String {
        let result = fraction.isEmpty ? integer : "\(integer).\(String(fraction))"
        let hasNonZeroMagnitude = integer != "0" || fraction.contains(where: { $0 != "0" })
        return negative && hasNonZeroMagnitude ? "-\(result)" : result
    }
}
