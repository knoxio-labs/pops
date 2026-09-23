import Foundation

/// A primitive as expressions see it: the wire form, before a declared kind
/// decides what it means. A decimal, date, URL and text are all `text` here,
/// exactly as the server's evaluator treats them (`equal("1.0", "1.00")` is
/// false; arithmetic parses `text` as a decimal and fails if it is not one).
public enum InventoryExpressionValue: Hashable, Sendable {
    case text(String)
    case integer(Int64)
    case boolean(Bool)
    case option(String)
    case measurement(amount: String, unit: String)
    case reference(kind: InventoryReferenceTargetKind, id: String)

    /// The wire form of a canonical value; a reference's read-time state is dropped.
    public init(_ value: InventoryPrimitiveValue) {
        switch value {
        case .string(let text): self = .text(text)
        case .integer(let integer): self = .integer(integer.value)
        case .decimal(let decimal): self = .text(decimal.text)
        case .boolean(let boolean): self = .boolean(boolean)
        case .enumeration(let optionId): self = .option(optionId)
        case .measurement(let amount, let unit):
            self = .measurement(amount: amount.text, unit: unit)
        case .date(let date): self = .text(date.text)
        case .dateTime(let dateTime): self = .text(dateTime.text)
        case .url(let url): self = .text(url.text)
        case .reference(let reference):
            self = .reference(kind: reference.targetKind, id: reference.targetId)
        }
    }

    /// Parses a primitive wire value the way the server's expression parser
    /// does. A number is read as JavaScript reads it, an IEEE double, and is a
    /// primitive only when that double is a safe integer; anything else that is
    /// not an object (null, an array, a fractional or unsafe number) is
    /// `.notAnObject`, which the server reports as an invalid node.
    static func parse(_ json: InventoryJSON) -> LiteralParse {
        switch json {
        case .string(let text): return .value(.text(text))
        case .boolean(let boolean): return .value(.boolean(boolean))
        case .number(let text):
            guard let integer = safeInteger(text) else { return .notAnObject }
            return .value(.integer(integer))
        case .object(let object): return parse(object: object)
        case .null, .array: return .notAnObject
        }
    }

    private static func safeInteger(_ text: String) -> Int64? {
        guard let number = Double(text), number.rounded(.towardZero) == number,
            abs(number) <= Double(safeIntegers.upperBound)
        else { return nil }
        return Int64(number)
    }

    private static func parse(object: [String: InventoryJSON]) -> LiteralParse {
        let keys = object.keys.sorted()
        if keys == ["optionId"], case .string(let optionId)? = object["optionId"] {
            return .value(.option(optionId))
        }
        if keys == ["amount", "unit"], case .string(let amount)? = object["amount"],
            case .string(let unit)? = object["unit"]
        {
            return .value(.measurement(amount: amount, unit: unit))
        }
        if keys == ["targetId", "targetKind"], case .string(let id)? = object["targetId"],
            case .string(let kind)? = object["targetKind"],
            let targetKind = InventoryReferenceTargetKind(rawValue: kind)
        {
            return .value(.reference(kind: targetKind, id: id))
        }
        return .notPrimitive
    }

    /// The JSON-safe integer range the TypeScript server can represent exactly.
    static let safeIntegers: ClosedRange<Int64> = -9_007_199_254_740_991...9_007_199_254_740_991

    /// What parsing one literal found.
    enum LiteralParse {
        case value(InventoryExpressionValue)
        case notAnObject
        case notPrimitive
    }
}

extension InventoryExpressionValue {
    /// Equality as the server's `equal` node decides it: text by UTF-16 code
    /// unit (JavaScript `===`), not by Swift's canonical equivalence.
    func wireEquals(_ other: Self) -> Bool {
        switch (self, other) {
        case (.text(let lhs), .text(let rhs)), (.option(let lhs), .option(let rhs)):
            return lhs.wireEquals(rhs)
        case (.measurement(let lhs, let unit), .measurement(let rhs, let other)):
            return lhs.wireEquals(rhs) && unit.wireEquals(other)
        case (.reference(let kind, let lhs), .reference(let other, let rhs)):
            return kind == other && lhs.wireEquals(rhs)
        case (.integer(let lhs), .integer(let rhs)): return lhs == rhs
        case (.boolean(let lhs), .boolean(let rhs)): return lhs == rhs
        default: return false
        }
    }
}

extension String {
    /// JavaScript string identity: the same UTF-16 code units.
    func wireEquals(_ other: String) -> Bool { utf16.elementsEqual(other.utf16) }
}
