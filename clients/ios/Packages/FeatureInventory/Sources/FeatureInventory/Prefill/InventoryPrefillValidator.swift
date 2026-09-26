import AppCore

internal enum InventoryPrefillValidator {
    internal static func validate(
        _ raw: [String: InventoryPrefillRawValue], fields: [InventoryCatalogueField]
    ) -> [String: [InventoryPrimitiveValue]] {
        let fieldsByID = Dictionary(uniqueKeysWithValues: fields.map { ($0.id, $0) })

        return raw.reduce(into: [String: [InventoryPrimitiveValue]]()) { result, entry in
            guard let field = fieldsByID[entry.key],
                let values = values(for: entry.value, field: field),
                !values.isEmpty
            else { return }
            result[entry.key] = values
        }
    }

    private static func values(
        for raw: InventoryPrefillRawValue, field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        switch field.kind {
        case .shortText, .longText, .integer, .decimal, .measurement, .date, .dateTime, .url:
            return textValues(from: raw, for: field)
        case .boolean:
            return flagValues(from: raw, for: field)
        case .enumeration:
            return enumValues(from: raw, for: field)
        case .reference:
            return nil
        }
    }

    private static func textValues(
        from raw: InventoryPrefillRawValue, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard let texts = texts(from: raw), !texts.isEmpty,
            field.cardinality == .many || texts.count <= 1
        else { return nil }

        let values = texts.compactMap { textValue($0, for: field) }
        return values.isEmpty ? nil : values
    }

    private static func flagValues(
        from raw: InventoryPrefillRawValue, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        let flags: [Bool]
        switch raw {
        case .flag(let flag): flags = [flag]
        case .flags(let values): flags = values
        case .text, .texts: return nil
        }
        guard !flags.isEmpty, field.cardinality == .many || flags.count <= 1 else { return nil }
        return flags.map(InventoryPrimitiveValue.boolean)
    }

    private static func enumValues(
        from raw: InventoryPrefillRawValue, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard let texts = texts(from: raw), !texts.isEmpty,
            field.cardinality == .many || texts.count <= 1
        else { return nil }

        let activeOptions = field.enumOptions.filter { $0.archivedAt == nil }
        let values = texts.compactMap { enumValue($0, options: activeOptions) }
        return values.isEmpty ? nil : values
    }

    private static func textValue(
        _ text: String, for field: InventoryCatalogueField
    ) -> InventoryPrimitiveValue? {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        guard case .value(let value) = InventoryProtocol2ValueText.parse(text, for: field)
        else { return nil }
        return value
    }

    private static func enumValue(
        _ text: String, options: [InventoryCatalogueOption]
    ) -> InventoryPrimitiveValue? {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let option = options.first(where: { $0.label == text })
        else { return nil }
        return .enumeration(optionId: option.id)
    }

    private static func texts(from raw: InventoryPrefillRawValue) -> [String]? {
        switch raw {
        case .text(let text): [text]
        case .texts(let texts): texts
        case .flag, .flags: nil
        }
    }
}
