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
        _ product: InventoryBarcodeProduct, fields: [InventoryCatalogueField], isbn: String? = nil
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
            case .genre:
                guard field.kind == .enumeration,
                    let values = enumValues(product.subjects, for: field)
                else { return }
                result[field.id] = values
            case .format:
                guard field.kind == .enumeration,
                    let values = enumValues(formatValues(product.attributes), for: field)
                else { return }
                result[field.id] = values
            case .isbn:
                guard let isbn, let value = textValue(isbn, for: field) else { return }
                result[field.id] = [value]
            case .pageCount:
                guard let pageCount = product.pageCount,
                    let value = textValue(String(pageCount), for: field)
                else { return }
                result[field.id] = [value]
            }
        }
    }

    private enum CanonicalField {
        case author
        case genre
        case format
        case isbn
        case language
        case pageCount
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
        let genreKeys = ["genre", "genres", "subject", "subjects", "category", "categories"]
        if names.contains(where: genreKeys.contains) {
            return .genre
        }
        let formatKeys = ["format", "formats", "binding", "bookformat", "physicalformat", "type"]
        if names.contains(where: formatKeys.contains) {
            return .format
        }
        let isbnKeys = ["isbn", "isbn10", "isbn13"]
        if names.contains(where: isbnKeys.contains) {
            return .isbn
        }
        let help = normalized(field.help ?? "")
        let pageCountKeys = ["pagecount", "pages", "numberofpages"]
        if names.contains(where: pageCountKeys.contains) || help.contains("pagecount") {
            return .pageCount
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

    private static func enumValues(
        _ candidates: [String], for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        let candidateValues = Set(candidates.map(normalized))
        let matches = field.enumOptions
            .filter { option in
                option.archivedAt == nil
                    && (candidateValues.contains(normalized(option.key))
                        || candidateValues.contains(normalized(option.label)))
            }
            .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
        guard !matches.isEmpty, field.cardinality == .many || matches.count == 1 else {
            return nil
        }
        return matches.map { .enumeration(optionId: $0.id) }
    }

    private static func textValue(
        _ value: String, for field: InventoryCatalogueField
    ) -> InventoryPrimitiveValue? {
        guard case .value(let parsed) = InventoryProtocol2ValueText.parse(value, for: field)
        else { return nil }
        return parsed
    }

    private static func formatValues(_ attributes: [String: String]) -> [String] {
        let formatKeys = ["format", "physicalformat", "binding", "bookformat", "editiontype"]
        return attributes
            .filter { formatKeys.contains(normalized($0.key)) }
            .sorted { normalized($0.key) < normalized($1.key) }
            .compactMap { nonempty($0.value) }
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
