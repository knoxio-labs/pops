import AppCore
import Foundation

/// Splits an item's recorded fields into the two places Item detail shows
/// them, by what the catalogue descriptor says about its type.
///
/// A highlighted field sits beside the placement, in the order the type
/// declares it; every other field is under Details. The descriptor is the
/// only authority: an item whose type the catalogue does not describe (none
/// yet, or one this replica has not downloaded) highlights nothing, and a
/// value stored under a key its type no longer declares is still shown, under
/// Details and by its key, rather than silently dropped.
internal struct InventoryDetailFields: Equatable {
    internal let highlighted: [InventoryDetailField]
    internal let other: [InventoryDetailField]

    internal init(
        values: [String: InventoryFieldValue], type: InventoryType?,
        locale: Locale = .autoupdatingCurrent
    ) {
        let declared = type?.fields ?? []
        let line = { (key: String, label: String) -> InventoryDetailField? in
            values[key].flatMap { Self.display($0, locale: locale) }.map {
                InventoryDetailField(key: key, label: label, value: $0)
            }
        }
        let declaredKeys = Set(declared.map(\.key))
        let undeclared = values.keys.filter { !declaredKeys.contains($0) }.sorted()
        highlighted = declared.filter(\.highlighted).compactMap { line($0.key, $0.label) }
        other =
            declared.filter { !$0.highlighted }.compactMap { line($0.key, $0.label) }
            + undeclared.compactMap { line($0, $0) }
    }

    internal init(
        entries: [InventoryItemFieldEntry], type: InventoryCatalogueType,
        source: any InventoryQuerySource
    ) {
        let definitions = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.id, $0) })
        let values = Dictionary(uniqueKeysWithValues: entries.map { ($0.fieldId, $0) })
        let line = { (field: InventoryCatalogueField) -> InventoryDetailField? in
            values[field.id].map {
                InventoryDetailField(
                    key: field.id, label: field.label,
                    value: Self.protocol2Display($0, field: field, source: source))
            }
        }
        let declared = type.fields.compactMap(line)
        let highlightedIds = Set(type.fields.filter(Self.isHighlighted).map(\.id))
        highlighted = declared.filter { highlightedIds.contains($0.id) }
        other =
            declared.filter { !highlightedIds.contains($0.id) }
            + entries.filter { definitions[$0.fieldId] == nil }.map {
                InventoryDetailField(
                    key: $0.fieldId, label: $0.fieldId,
                    value: Self.undeclaredProtocol2Display($0))
            }
    }

    /// One value as a line reads it. A measurement keeps the unit it was
    /// recorded in (POPS-4015); nothing here converts. Nil for a placement,
    /// which only an event's before and after carry: the page's placement line
    /// is where an item's whereabouts are drawn, never a field row.
    internal static func display(
        _ value: InventoryFieldValue, locale: Locale = .autoupdatingCurrent
    ) -> String? {
        switch value {
        case .text(let text), .choice(let text), .link(let text):
            text
        case .flag(let flag):
            flag ? "Yes" : "No"
        case .measurement(let measurement):
            "\(number(measurement.value, locale: locale)) \(measurement.unit)"
        case .range(let range):
            "\(number(range.low, locale: locale))\u{2013}\(number(range.high, locale: locale)) \(range.unit)"
        case .placement, .previousPlacement:
            nil
        }
    }

    private static func number(_ value: Double, locale: Locale) -> String {
        value.formatted(.number.grouping(.never).locale(locale))
    }

    private static func protocol2Display(
        _ entry: InventoryItemFieldEntry, field: InventoryCatalogueField,
        source: any InventoryQuerySource
    ) -> String {
        switch entry.state {
        case .unavailable(let reason):
            return InventoryProtocol2Display.unavailable(reason)
        case .value(let values):
            return InventoryProtocol2Display.text(
                for: values, field: field,
                referenceLabel: { reference in
                    guard reference.targetState != .deleted, reference.targetState != .missing
                    else { return nil }
                    switch reference.targetKind {
                    case .item:
                        return source.inventoryItem(id: reference.targetId).flatMap {
                            $0.isDeleted ? nil : $0.name
                        }
                    case .location:
                        return source.inventoryLocation(id: reference.targetId).flatMap {
                            $0.isDeleted ? nil : $0.name
                        }
                    }
                })
        }
    }

    private static func undeclaredProtocol2Display(_ entry: InventoryItemFieldEntry) -> String {
        switch entry.state {
        case .unavailable(let reason):
            return InventoryProtocol2Display.unavailable(reason)
        case .value(let values):
            return values.map(InventoryProtocol2ValueText.input).joined(separator: " · ")
        }
    }

    private static func isHighlighted(_ field: InventoryCatalogueField) -> Bool {
        guard case .object(let presentation) = field.presentation,
            case .boolean(true)? = presentation["highlighted"]
        else { return false }
        return true
    }
}
