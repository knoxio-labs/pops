import AppCore

internal struct InventoryProtocol2DraftEntry: Identifiable, Hashable, Sendable {
    internal let id: String
    internal var input: String
    internal var value: InventoryPrimitiveValue?
    internal var referenceKind: InventoryReferenceTargetKind?
    internal var issue: String?

    internal init(id: String, value: InventoryPrimitiveValue? = nil) {
        self.id = id
        input = value.map(InventoryProtocol2ValueText.input) ?? ""
        self.value = value
        if case .reference(let reference)? = value {
            referenceKind = reference.targetKind
        }
    }

    /// Parses typed text into this entry's value, the way every text-backed
    /// editor does it, whether the entry belongs to a staged draft or to a
    /// computed field's override being composed.
    internal mutating func setText(_ input: String, for field: InventoryCatalogueField) {
        self.input = input
        switch InventoryProtocol2ValueText.parse(input, for: field) {
        case .value(let value):
            self.value = value
            issue = nil
        case .issue(let issue):
            value = nil
            self.issue = issue
        }
    }

    internal mutating func setValue(_ value: InventoryPrimitiveValue?) {
        self.value = value
        input = value.map(InventoryProtocol2ValueText.input) ?? ""
        if case .reference(let reference)? = value {
            referenceKind = reference.targetKind
        }
        issue = nil
    }

    internal mutating func setReferenceKind(_ kind: InventoryReferenceTargetKind) {
        referenceKind = kind
        if case .reference(let reference)? = value, reference.targetKind != kind {
            value = nil
            input = ""
        }
        issue = nil
    }
}

internal struct InventoryProtocol2DraftIssue: Equatable, Sendable {
    internal let fieldId: String
    internal let message: String
}

internal struct InventoryProtocol2ReferenceTarget: Identifiable, Equatable, Sendable {
    internal let kind: InventoryReferenceTargetKind
    internal let id: String
    internal let label: String
    internal let typeId: String?

    internal var value: InventoryReferenceValue {
        InventoryReferenceValue(targetKind: kind, targetId: id, targetState: .resolved)
    }
}

internal enum InventoryProtocol2ParseResult {
    case value(InventoryPrimitiveValue?)
    case issue(String)
}

internal enum InventoryProtocol2ValueText {
    internal static func input(_ value: InventoryPrimitiveValue) -> String {
        switch value {
        case .string(let value): value
        case .integer(let value): String(value.value)
        case .decimal(let value): value.text
        case .date(let value): value.text
        case .dateTime(let value): value.text
        case .url(let value): value.text
        case .measurement(let amount, _): amount.text
        case .reference(let value): value.targetId
        case .boolean(let value): value ? "true" : "false"
        case .enumeration(let optionId): optionId
        }
    }

    internal static func parse(
        _ input: String, for field: InventoryCatalogueField
    ) -> InventoryProtocol2ParseResult {
        if input.isEmpty { return .value(nil) }
        switch field.kind {
        case .shortText:
            return string(input, limit: 200, label: field.label)
        case .longText:
            return string(input, limit: 20_000, label: field.label)
        case .integer:
            return integer(input)
        case .decimal:
            return decimal(input)
        case .date:
            return date(input)
        case .dateTime:
            return dateTime(input)
        case .url:
            return url(input)
        case .measurement:
            return measurement(input, unit: field.fixedUnit)
        case .boolean, .enumeration, .reference:
            return .issue("Choose a value from the available options.")
        }
    }

    private static func string(
        _ input: String, limit: Int, label: String
    ) -> InventoryProtocol2ParseResult {
        let count = input.unicodeScalars.count
        guard count <= limit else {
            return .issue("\(label) must be \(limit.formatted()) characters or fewer.")
        }
        return .value(.string(input))
    }

    private static func integer(_ input: String) -> InventoryProtocol2ParseResult {
        guard let number = Int64(input), let integer = try? InventoryInteger(number) else {
            return .issue(
                "Enter a whole number between -9,007,199,254,740,991 and "
                    + "9,007,199,254,740,991.")
        }
        return .value(.integer(integer))
    }

    private static func decimal(_ input: String) -> InventoryProtocol2ParseResult {
        guard let decimal = try? InventoryDecimal(input) else {
            return .issue("Enter a decimal with up to 18 digits and 9 decimal places.")
        }
        return .value(.decimal(decimal))
    }

    private static func date(_ input: String) -> InventoryProtocol2ParseResult {
        guard let date = try? InventoryCanonicalDate(input) else {
            return .issue("Enter a valid date as YYYY-MM-DD.")
        }
        return .value(.date(date))
    }

    private static func dateTime(_ input: String) -> InventoryProtocol2ParseResult {
        guard let date = try? InventoryCanonicalDateTime(input) else {
            return .issue("Enter a UTC time as YYYY-MM-DDTHH:MM:SS.sssZ.")
        }
        return .value(.dateTime(date))
    }

    private static func url(_ input: String) -> InventoryProtocol2ParseResult {
        guard let url = try? InventoryCanonicalURL(input) else {
            return .issue("Enter a complete HTTPS URL.")
        }
        return .value(.url(url))
    }

    private static func measurement(
        _ input: String, unit: String?
    ) -> InventoryProtocol2ParseResult {
        guard let unit, let amount = try? InventoryDecimal(input) else {
            return .issue("Enter an amount in \(unit ?? "the required unit").")
        }
        return .value(.measurement(amount: amount, unit: unit))
    }
}

internal enum InventoryProtocol2ReferenceTargets {
    internal static func allowed(
        for field: InventoryCatalogueField, among targets: [InventoryProtocol2ReferenceTarget]
    ) -> [InventoryProtocol2ReferenceTarget] {
        targets.filter { target in
            guard field.references.targetKinds.contains(target.kind) else { return false }
            guard target.kind == .item, !field.references.targetTypeIds.isEmpty else {
                return true
            }
            return target.typeId.map(field.references.targetTypeIds.contains) == true
        }
    }
}

internal enum InventoryProtocol2EnumOptions {
    internal static func selectable(
        for field: InventoryCatalogueField, retaining selectedId: String?
    ) -> [InventoryCatalogueOption] {
        field.enumOptions.filter { $0.archivedAt == nil || $0.id == selectedId }
            .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
    }
}

internal enum InventoryProtocol2Display {
    internal static func text(
        for values: [InventoryPrimitiveValue], field: InventoryCatalogueField,
        referenceLabel: (InventoryReferenceValue) -> String?
    ) -> String {
        guard !values.isEmpty else { return "Not available" }
        return values.map {
            valueText($0, field: field, referenceLabel: referenceLabel)
        }.joined(separator: " · ")
    }

    internal static func unavailable(_ reason: InventoryValueUnavailableReason) -> String {
        switch reason {
        case .missingDependency: "Unavailable because a required value is missing"
        case .referenceUnresolved: "Unavailable until the referenced record is downloaded"
        case .referenceMissing: "Unavailable because the referenced record is missing"
        case .referenceDeleted: "Unavailable because the referenced record was deleted"
        case .evaluationError: "Unavailable because the calculation failed"
        }
    }

    /// A computed field's unavailable reason, naming the missing dependency
    /// by label when the reason identifies one. Shared by Item detail and the
    /// item form, the two places a computed value's unavailability is shown.
    internal static func unavailable(
        reason: String, failedFieldId: String, dependencyLabel: (String) -> String?
    ) -> String {
        guard let known = InventoryValueUnavailableReason(rawValue: reason) else {
            return "Unavailable"
        }
        if known == .missingDependency, let missing = dependencyLabel(failedFieldId) {
            return "Unavailable until \(missing) is set"
        }
        return unavailable(known)
    }

    private static func valueText(
        _ primitive: InventoryPrimitiveValue, field: InventoryCatalogueField,
        referenceLabel: (InventoryReferenceValue) -> String?
    ) -> String {
        switch primitive {
        case .string(let value): return value
        case .integer(let value): return String(value.value)
        case .decimal(let value): return value.text
        case .boolean(let value): return value ? "Yes" : "No"
        case .enumeration(let optionId):
            return enumeration(optionId, field: field)
        case .measurement(let amount, let unit): return "\(amount.text) \(unit)"
        case .date(let value): return value.text
        case .dateTime(let value): return value.text
        case .url(let value): return value.text
        case .reference(let value):
            return reference(value, label: referenceLabel(value))
        }
    }

    private static func enumeration(
        _ optionId: String, field: InventoryCatalogueField
    ) -> String {
        guard let option = field.enumOptions.first(where: { $0.id == optionId }) else {
            return "Unknown option"
        }
        return option.archivedAt == nil ? option.label : "\(option.label) (Retired)"
    }

    private static func reference(
        _ value: InventoryReferenceValue, label: String?
    ) -> String {
        if let label { return label }
        switch value.targetState {
        case .deleted: return "Deleted \(value.targetKind.label.lowercased())"
        case .missing: return "Missing \(value.targetKind.label.lowercased())"
        case .unresolved, .none:
            return "Unresolved \(value.targetKind.label.lowercased())"
        case .resolved: return value.targetId
        }
    }
}

extension InventoryReferenceTargetKind {
    internal var label: String {
        switch self {
        case .item: "Item"
        case .location: "Location"
        }
    }
}
