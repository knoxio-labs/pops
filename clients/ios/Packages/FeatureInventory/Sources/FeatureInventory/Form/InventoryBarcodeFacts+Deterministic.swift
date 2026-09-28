import AppCore

extension InventoryBarcodeFacts {
    internal static func deterministicValues(
        _ product: InventoryBarcodeProduct, fields: [InventoryCatalogueField], isbn: String? = nil
    ) -> [String: [InventoryPrimitiveValue]] {
        fields.reduce(into: [String: [InventoryPrimitiveValue]]()) { result, field in
            guard let values = deterministicValue(product, field: field, isbn: isbn) else {
                return
            }
            result[field.id] = values
        }
    }

    private static func deterministicValue(
        _ product: InventoryBarcodeProduct, field: InventoryCatalogueField, isbn: String?
    ) -> [InventoryPrimitiveValue]? {
        guard let kind = canonicalField(for: field) else { return nil }
        switch kind {
        case .author:
            return authorValue(product, for: field)
        case .genre:
            return genreValue(product, for: field)
        case .format:
            return formatValue(product, for: field)
        case .isbn:
            return isbnValue(isbn, for: field)
        case .language:
            return languageValue(product, for: field)
        case .pageCount:
            return pageCountValue(product, for: field)
        }
    }

    private static func authorValue(
        _ product: InventoryBarcodeProduct, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        let names = authorNames(product, explicitRoleOnly: false)
        guard !names.isEmpty,
            let value = stringValue(names.joined(separator: ", "), for: field)
        else { return nil }
        return [value]
    }

    private static func genreValue(
        _ product: InventoryBarcodeProduct, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard field.kind == .enumeration else { return nil }
        return enumValues(product.subjects, for: field)
    }

    private static func formatValue(
        _ product: InventoryBarcodeProduct, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard field.kind == .enumeration else { return nil }
        return enumValues(formatValues(product.attributes), for: field)
    }

    private static func isbnValue(
        _ isbn: String?, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard let isbn, let value = textValue(isbn, for: field) else { return nil }
        return [value]
    }

    private static func languageValue(
        _ product: InventoryBarcodeProduct, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard let language = nonempty(product.language) else { return nil }
        if field.kind == .enumeration,
            let option = languageOption(language, options: field.enumOptions)
        {
            return [.enumeration(optionId: option.id)]
        }
        guard let value = stringValue(language, for: field) else { return nil }
        return [value]
    }

    private static func pageCountValue(
        _ product: InventoryBarcodeProduct, for field: InventoryCatalogueField
    ) -> [InventoryPrimitiveValue]? {
        guard let pageCount = product.pageCount,
            let value = textValue(String(pageCount), for: field)
        else { return nil }
        return [value]
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
        let formatKeys = [
            "format", "formats", "binding", "bookformat", "physicalformat", "type",
        ]
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
}
