import AppCore
import Foundation

internal enum InventoryBarcodeFacts {
    internal static func facts(_ product: InventoryBarcodeProduct) -> [InventoryPrefillFact] {
        let contributors = product.contributors.compactMap { contributor -> String? in
            guard let name = nonempty(contributor.name) else { return nil }
            if let role = nonempty(contributor.role) { return "\(name) (\(role))" }
            return name
        }
        let properties: [(String, String?)] = [
            ("Title", product.title),
            ("Subtitle", product.subtitle),
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

    private static func nonempty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
        else {
            return nil
        }
        return value
    }
}
