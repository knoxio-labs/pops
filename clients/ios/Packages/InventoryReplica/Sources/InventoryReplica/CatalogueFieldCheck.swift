import AppCore
import Foundation

/// Whether a `fields` blob fits a type, as the server's derived zod schema
/// decides (`typeFieldsSchema`, `fieldValueSchema`): no key the type does
/// not declare, every required key present, and each value of the declared
/// kind, with a choice from its list, a unit of its dimension and a range
/// whose low does not exceed its high.
internal enum CatalogueFieldCheck {
    static func fits(
        _ fields: [String: InventoryFieldValue], type: InventoryType, units: [InventoryUnit]
    ) -> Bool {
        let declared = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.key, $0) })
        guard fields.keys.allSatisfy({ declared[$0] != nil }) else { return false }
        guard type.fields.allSatisfy({ !$0.required || fields[$0.key] != nil }) else {
            return false
        }
        return fields.allSatisfy { key, value in
            declared[key].map { fits(value, $0, units: units) } ?? false
        }
    }

    private static func fits(
        _ value: InventoryFieldValue, _ field: InventoryFieldDefinition, units: [InventoryUnit]
    ) -> Bool {
        switch (field.kind, value) {
        case (.text, .text(let text)): !text.isEmpty
        case (.link, .link(let link)): isURL(link)
        case (.flag, .flag): true
        case (.choice, .choice(let choice)): field.choices?.contains(choice) ?? false
        case (.measurement, .measurement(let measurement)):
            unit(measurement.unit, isOf: field.dimension, in: units)
        case (.range, .range(let range)):
            range.low <= range.high && unit(range.unit, isOf: field.dimension, in: units)
        default: false
        }
    }

    private static func unit(_ key: String, isOf dimension: String?, in units: [InventoryUnit])
        -> Bool
    {
        units.contains { $0.key == key && $0.dimension == dimension }
    }

    private static func isURL(_ text: String) -> Bool {
        guard let url = URL(string: text), let scheme = url.scheme else { return false }
        return !scheme.isEmpty
    }
}
