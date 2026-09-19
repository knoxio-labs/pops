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
}
