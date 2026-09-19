import AppCore
import Foundation

/// What a person has put into one of a type's fields so far, in the shape
/// the row edits rather than the shape the store takes.
///
/// Figures are held as text because a half-typed number is a string, and
/// rounding it while somebody is still typing is how a form eats a decimal
/// point. The unit is held beside them and never converted: a measurement
/// keeps the unit it was typed in (POPS-4015).
internal enum InventoryFieldEntry: Hashable, Sendable {
    case text(String)
    case choice(String?)
    case flag(Bool)
    case measurement(amount: String, unit: String)
    case range(low: String, high: String, unit: String)
    case link(String)

    /// The empty entry a field starts at, in the field's default unit, or the
    /// first unit its dimension has when it declares none.
    internal static func blank(
        for field: InventoryFieldDefinition, units: [InventoryUnit]
    ) -> InventoryFieldEntry {
        let unit =
            field.defaultUnit ?? InventoryFormUnits.options(for: field, in: units).first ?? ""
        switch field.kind {
        case .text: return .text("")
        case .choice: return .choice(nil)
        case .flag: return .flag(false)
        case .measurement: return .measurement(amount: "", unit: unit)
        case .range: return .range(low: "", high: "", unit: unit)
        case .link: return .link("")
        }
    }

    /// An existing value, opened for editing, in the unit it was stored in.
    internal init(_ value: InventoryFieldValue) {
        switch value {
        case .text(let text): self = .text(text)
        case .choice(let choice): self = .choice(choice)
        case .flag(let flag): self = .flag(flag)
        case .measurement(let measurement):
            self = .measurement(
                amount: InventoryFormAmount.text(measurement.value), unit: measurement.unit)
        case .range(let range):
            self = .range(
                low: InventoryFormAmount.text(range.low),
                high: InventoryFormAmount.text(range.high), unit: range.unit)
        case .link(let link): self = .link(link)
        }
    }

    /// The value this entry stands for against `field`, `nil` when nothing
    /// has been entered, or why it cannot be stored as it is.
    ///
    /// A choice outside the field's declared list is never produced: the
    /// list is the type's, and the server refuses anything else.
    internal func value(
        for field: InventoryFieldDefinition
    ) -> Result<InventoryFieldValue?, InventoryDraftIssue> {
        switch self {
        case .text(let text):
            return .success(Self.trimmed(text).map { .text($0) })
        case .link(let link):
            return .success(Self.trimmed(link).map { .link($0) })
        case .flag(let flag):
            return .success(.flag(flag))
        case .choice(let choice):
            guard let choice, InventoryFormChoices.options(for: field).contains(choice) else {
                return .success(nil)
            }
            return .success(.choice(choice))
        case .measurement(let amount, let unit):
            return Self.measurement(amount: amount, unit: unit, field: field)
        case .range(let low, let high, let unit):
            return Self.range(low: low, high: high, unit: unit, field: field)
        }
    }

    private static func measurement(
        amount: String, unit: String, field: InventoryFieldDefinition
    ) -> Result<InventoryFieldValue?, InventoryDraftIssue> {
        guard trimmed(amount) != nil else { return .success(nil) }
        guard let value = InventoryFormAmount.number(amount) else {
            return .failure(.notANumber(label: field.label))
        }
        return .success(.measurement(InventoryMeasurement(value: value, unit: unit)))
    }

    private static func range(
        low: String, high: String, unit: String, field: InventoryFieldDefinition
    ) -> Result<InventoryFieldValue?, InventoryDraftIssue> {
        if trimmed(low) == nil, trimmed(high) == nil { return .success(nil) }
        guard let lowValue = InventoryFormAmount.number(low),
            let highValue = InventoryFormAmount.number(high)
        else { return .failure(.notANumber(label: field.label)) }
        guard lowValue <= highValue else { return .failure(.rangeReversed(label: field.label)) }
        return .success(.range(InventoryRange(low: lowValue, high: highValue, unit: unit)))
    }

    private static func trimmed(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// The values a choice field offers: exactly the ones its type declares, and
/// nothing when it declares none. Code-defined like the type itself, so two
/// people recording the same connector write the same word.
internal enum InventoryFormChoices {
    /// Above this many, the pushed list gains a search field.
    internal static let searchableThreshold = 8

    internal static func options(for field: InventoryFieldDefinition) -> [String] {
        field.choices ?? []
    }

    /// The declared values matching `query`, all of them for an empty one.
    internal static func options(
        for field: InventoryFieldDefinition, matching query: String
    ) -> [String] {
        let query = query.trimmingCharacters(in: .whitespaces)
        let all = options(for: field)
        guard !query.isEmpty else { return all }
        return all.filter { $0.localizedCaseInsensitiveContains(query) }
    }

    internal static func isSearchable(_ field: InventoryFieldDefinition) -> Bool {
        options(for: field).count > searchableThreshold
    }
}

/// The units one field can be written in: every unit of its dimension, from
/// the catalogue's unit table. The unit belongs to the value, not to the
/// field, so a length can be millimetres on one item and metres on the next.
internal enum InventoryFormUnits {
    internal static func options(
        for field: InventoryFieldDefinition, in units: [InventoryUnit]
    ) -> [String] {
        guard let dimension = field.dimension else { return [] }
        return units.filter { $0.dimension == dimension }.map(\.key)
    }
}

/// A figure as a field holds it, and back.
internal enum InventoryFormAmount {
    internal static func text(_ value: Double) -> String {
        value == value.rounded() ? String(format: "%.0f", value) : String(format: "%g", value)
    }

    /// A typed figure, accepting a comma as the decimal separator.
    internal static func number(_ text: String) -> Double? {
        let cleaned = text.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: ",", with: ".")
        guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite else { return nil }
        return value
    }
}
