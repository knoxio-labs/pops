import Foundation

extension InventoryExpressionValue {
    /// The canonical value of `kind` this wire value denotes, or nil when it is
    /// not one: the server's `canonicalExpressionResult`, which turns such a
    /// result into an `invalid_value` evaluation error. An enum result may name
    /// any option and a reference any item or location, as there.
    public func canonical(kind: InventoryPrimitiveKind, fixedUnit: String?)
        -> InventoryPrimitiveValue?
    {
        switch kind {
        case .shortText: return text(scalars: 1...200).map(InventoryPrimitiveValue.string)
        case .longText: return text(scalars: 1...20_000).map(InventoryPrimitiveValue.string)
        case .integer, .decimal, .boolean: return canonicalScalar(kind: kind)
        case .enumeration:
            guard case .option(let optionId) = self, Self.isUUID(optionId) else { return nil }
            return .enumeration(optionId: optionId)
        case .measurement: return canonicalMeasurement(fixedUnit: fixedUnit)
        case .date, .dateTime, .url: return canonicalText(kind: kind)
        case .reference:
            guard case .reference(let targetKind, let id) = self, Self.isUUID(id) else {
                return nil
            }
            return .reference(InventoryReferenceValue(targetKind: targetKind, targetId: id))
        }
    }

    private func canonicalScalar(kind: InventoryPrimitiveKind) -> InventoryPrimitiveValue? {
        switch (kind, self) {
        case (.integer, .integer(let value)):
            return (try? InventoryInteger(value)).map(InventoryPrimitiveValue.integer)
        case (.decimal, .text(let text)):
            return (try? InventoryDecimal(text)).map(InventoryPrimitiveValue.decimal)
        case (.boolean, .boolean(let value)): return .boolean(value)
        default: return nil
        }
    }

    private func text(scalars: ClosedRange<Int>) -> String? {
        guard case .text(let text) = self, scalars.contains(text.unicodeScalars.count) else {
            return nil
        }
        return text
    }

    private func canonicalMeasurement(fixedUnit: String?) -> InventoryPrimitiveValue? {
        guard case .measurement(let amount, let unit) = self, let fixedUnit,
            unit.wireEquals(fixedUnit),
            let decimal = try? InventoryDecimal(amount)
        else { return nil }
        return .measurement(amount: decimal, unit: unit)
    }

    private func canonicalText(kind: InventoryPrimitiveKind) -> InventoryPrimitiveValue? {
        guard case .text(let text) = self else { return nil }
        switch kind {
        case .date: return (try? InventoryCanonicalDate(text)).map(InventoryPrimitiveValue.date)
        case .dateTime:
            return (try? InventoryCanonicalDateTime(text)).map(InventoryPrimitiveValue.dateTime)
        default: return (try? InventoryCanonicalURL(text)).map(InventoryPrimitiveValue.url)
        }
    }

    private static func isUUID(_ text: String) -> Bool {
        let pattern =
            #"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"#
        return text.range(of: pattern, options: .regularExpression) != nil
    }
}
