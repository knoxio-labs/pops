import AppCore

extension InventoryBarcodeFacts {
    internal static func authorNames(
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

    internal static func stringValue(
        _ value: String, for field: InventoryCatalogueField
    ) -> InventoryPrimitiveValue? {
        switch field.kind {
        case .shortText, .longText: return .string(value)
        default: return nil
        }
    }

    internal static func enumValues(
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

    internal static func textValue(
        _ value: String, for field: InventoryCatalogueField
    ) -> InventoryPrimitiveValue? {
        guard case .value(let parsed) = InventoryProtocol2ValueText.parse(value, for: field)
        else { return nil }
        return parsed
    }

    internal static func formatValues(_ attributes: [String: String]) -> [String] {
        let formatKeys = [
            "format", "physicalformat", "binding", "bookformat", "editiontype",
        ]
        return
            attributes
            .filter { formatKeys.contains(normalized($0.key)) }
            .sorted { normalized($0.key) < normalized($1.key) }
            .compactMap { nonempty($0.value) }
    }

    internal static func languageOption(
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
}
