import Foundation

extension InventoryExpression {
    /// `comparesDecimals`: whether validation typed an `equal` whose left
    /// operand is this node as comparing decimals. Decimals and text share a
    /// wire form, so version 2 needs it to compare `3.0` and `3` by value while
    /// text keeps comparing by identity (ADR-002 D5). A literal takes the kind
    /// its spelling gives it, a read its field's kind in `fieldKinds`,
    /// arithmetic is numeric, and `if` and `coalesce` take their first branch's.
    func comparesDecimals(fieldKinds: [String: InventoryPrimitiveKind]) -> Bool {
        switch self {
        case .literal(let value):
            guard case .text(let text) = value else { return false }
            return Self.spellsDecimal(text)
        case .read(_, let fieldId): return fieldKinds[fieldId] == .decimal
        case .unary(let op, _): return op == .negate
        case .binary(let op, _, _): return [.add, .subtract, .multiply, .divide].contains(op)
        case .conditional(_, let then, _): return then.comparesDecimals(fieldKinds: fieldKinds)
        case .coalesce(let values):
            return values.first?.comparesDecimals(fieldKinds: fieldKinds) ?? false
        }
    }

    /// The literal validator's `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`, which
    /// admits `-0` and any number of digits, unlike a canonical decimal.
    private static func spellsDecimal(_ text: String) -> Bool {
        var rest = Substring(text)
        if rest.first == "-" { rest = rest.dropFirst() }
        let parts = rest.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard let whole = parts.first, !whole.isEmpty, whole.allSatisfy(isDigit),
            whole == "0" || whole.first != "0"
        else { return false }
        guard parts.count == 2 else { return true }
        return !parts[1].isEmpty && parts[1].allSatisfy(isDigit)
    }

    private static func isDigit(_ character: Character) -> Bool {
        character.isASCII && character.isNumber
    }
}
