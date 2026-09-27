import AppCore
import Foundation

internal enum InventoryPrefillValidator {
    internal static func validate(
        _ raw: [String: InventoryPrefillRawValue], fields: [InventoryCatalogueField]
    ) -> [String: [InventoryPrimitiveValue]] {
        validated(raw, fields: fields, source: nil)
    }

    internal static func validate(
        _ raw: [String: InventoryPrefillRawValue], fields: [InventoryCatalogueField],
        source: InventoryPrefillSource
    ) -> [String: [InventoryPrimitiveValue]] {
        validated(raw, fields: fields, source: source)
    }

    private static func validated(
        _ raw: [String: InventoryPrefillRawValue], fields: [InventoryCatalogueField],
        source: InventoryPrefillSource?
    ) -> [String: [InventoryPrimitiveValue]] {
        let fieldsByID = Dictionary(uniqueKeysWithValues: fields.map { ($0.id, $0) })

        return raw.reduce(into: [String: [InventoryPrimitiveValue]]()) { result, entry in
            guard let field = fieldsByID[entry.key],
                source.map({ grounded(entry.value, in: $0) }) ?? true,
                let values = values(for: entry.value, field: field),
                !values.isEmpty
            else { return }
            result[entry.key] = values
        }
    }

    private static func grounded(
        _ raw: InventoryPrefillRawValue, in source: InventoryPrefillSource
    ) -> Bool {
        switch raw {
        case .text(let text):
            return groundedText(text, in: source)
        case .texts(let texts):
            return !texts.isEmpty && texts.allSatisfy {
                groundedText($0, in: source)
            }
        case .flag(let flag):
            return groundedFlag(flag, in: source)
        case .flags(let flags):
            return !flags.isEmpty && flags.allSatisfy { groundedFlag($0, in: source) }
        }
    }

    private static func groundedText(_ text: String, in source: InventoryPrefillSource) -> Bool {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return evidenceContains(text, in: source)
    }

    private static func groundedFlag(_ flag: Bool, in source: InventoryPrefillSource) -> Bool {
        let expected = flag ? ["true", "yes", "present"] : ["false", "no", "absent"]
        let evidence = evidenceTokens(in: source)
        return expected.contains { expected in
            evidence.contains { tokens in tokens.contains(expected) }
        }
    }

    private static func evidenceContains(_ candidate: String, in source: InventoryPrefillSource)
        -> Bool
    {
        let candidateTokens = tokens(candidate)
        guard !candidateTokens.isEmpty else { return false }
        return evidenceTokens(in: source).contains { valueTokens in
            valueTokens.count >= candidateTokens.count
                && valueTokens.indices.contains(
                    where: { start in
                        Array(valueTokens[start...].prefix(candidateTokens.count)) == candidateTokens
                    })
        }
    }

    private static func evidenceTokens(in source: InventoryPrefillSource) -> [[String]] {
        switch source {
        case .product(let facts):
            facts.map { tokens($0.value) }
        case .text(let lines):
            lines.map(tokens)
        }
    }

    private static func tokens(_ text: String) -> [String] {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
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
