import AppCore
import Foundation

internal enum InventoryBarcodeFacts {
    internal static func facts(_ product: InventoryBarcodeProduct) -> [InventoryPrefillFact] {
        let authors = authorNames(product, explicitRoleOnly: true)
        let contributors = product.contributors.compactMap { contributor -> String? in
            guard let name = nonempty(contributor.name) else { return nil }
            if let role = nonempty(contributor.role) { return "\(name) (\(role))" }
            return name
        }
        let properties: [(String, String?)] = [
            ("Title", product.title),
            ("Subtitle", product.subtitle),
            ("Author", authors.joined(separator: ", ")),
            ("Contributors", contributors.joined(separator: ", ")),
            ("Publisher", product.publisher),
            ("Published", product.publishedDate),
            ("Pages", product.pageCount.map(String.init)),
            ("Language", product.language),
            ("Description", product.description),
            ("Subjects", product.subjects.compactMap { nonempty($0) }.joined(separator: ", ")),
        ]
        let attributes = product.attributes.sorted { $0.key < $1.key }
            .map { ($0.key, Optional($0.value)) }
        return (properties + attributes).compactMap { label, value in
            guard let label = nonempty(label), let value = nonempty(value) else { return nil }
            return InventoryPrefillFact(label: label, value: value)
        }
    }

    internal static func deterministicValues(
        _ product: InventoryBarcodeProduct, fields: [InventoryCatalogueField]
    ) -> [String: [InventoryPrimitiveValue]] {
        fields.reduce(into: [String: [InventoryPrimitiveValue]]()) { result, field in
            guard let kind = canonicalField(for: field) else { return }
            switch kind {
            case .author:
                let names = authorNames(product, explicitRoleOnly: false)
                guard !names.isEmpty,
                    let value = stringValue(names.joined(separator: ", "), for: field)
                else { return }
                result[field.id] = [value]
            case .language:
                guard let language = nonempty(product.language) else { return }
                if field.kind == .enumeration,
                    let option = languageOption(language, options: field.enumOptions)
                {
                    result[field.id] = [.enumeration(optionId: option.id)]
                } else if let value = stringValue(language, for: field) {
                    result[field.id] = [value]
                }
            }
        }
    }

    private enum CanonicalField {
        case author
        case language
    }

    private static func canonicalField(for field: InventoryCatalogueField) -> CanonicalField? {
        let names = [normalized(field.key), normalized(field.label)]
        let authorKeys = [
            "author", "authors", "authorname", "authorsname", "writer", "writers",
            "contributor", "contributors", "creator", "creators", "autor", "autores",
        ]
        if names.contains(where: authorKeys.contains) {
            return .author
        }
        let languageKeys = ["language", "languages", "languagecode", "lang", "idioma"]
        if names.contains(where: languageKeys.contains) {
            return .language
        }
        return nil
    }

    private static func authorNames(
        _ product: InventoryBarcodeProduct, explicitRoleOnly: Bool
    ) -> [String] {
        let contributors = product.contributors.compactMap { contributor -> (String, String?)? in
            guard let name = nonempty(contributor.name) else { return nil }
            return (name, contributor.role.map(normalized))
        }
        let explicitAuthors = contributors.filter {
            $0.1 == "author" || $0.1 == "authors" || $0.1 == "autor" || $0.1 == "autores"
        }
        let selected = explicitAuthors.isEmpty && !explicitRoleOnly ? contributors : explicitAuthors
        return selected.map(\.0)
    }

    private static func stringValue(
        _ value: String, for field: InventoryCatalogueField
    ) -> InventoryPrimitiveValue? {
        switch field.kind {
        case .shortText, .longText: return .string(value)
        default: return nil
        }
    }

    private static func languageOption(
        _ language: String, options: [InventoryCatalogueOption]
    ) -> InventoryCatalogueOption? {
        let aliases: Set<String>
        switch normalized(language) {
        case "en", "eng":
            aliases = ["en", "eng", "english", "ingles", "inglesa"]
        case "pt", "por", "ptbr":
            aliases = ["pt", "por", "ptbr", "portuguese", "portugues", "brazilianportuguese"]
        case "es", "spa":
            aliases = ["es", "spa", "spanish", "espanol"]
        case "fr", "fra", "fre":
            aliases = ["fr", "fra", "fre", "french", "francais"]
        case "de", "deu", "ger":
            aliases = ["de", "deu", "ger", "german", "deutsch"]
        default:
            aliases = [normalized(language)]
        }
        return options.first {
            $0.archivedAt == nil
                && (aliases.contains(normalized($0.key)) || aliases.contains(normalized($0.label)))
        }
    }

    private static func normalized(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        .lowercased()
        .filter { $0.isLetter || $0.isNumber }
    }

    private static func nonempty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
        else {
            return nil
        }
        return value
    }
}
