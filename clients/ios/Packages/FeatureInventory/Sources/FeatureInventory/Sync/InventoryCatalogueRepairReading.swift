import AppCore

/// Reads a `catalogueChanged` repair against the catalogue this phone holds
/// now: one row per value the change carried, marked by where it stands
/// today, since a field the server named may have come back, and one the
/// server never named may have gone since.
///
/// What the server named (``AppCore/InventoryCatalogueChange``) supplies what
/// the phone cannot see for itself: which definition replaced a field, and
/// that a field this phone has never heard of is now required.
///
/// A stale reference (``AppCore/InventoryCatalogueRepair/staleReference``)
/// names no value, so each reference value is judged against
/// `referenceTargets`, the live records the item form's pickers offer: one
/// its field would not offer is in the way. When every one would be offered
/// (this phone has not heard of the deletion yet), every reference value is
/// marked with the server's reason, since one of them is in the way.
internal struct InventoryCatalogueRepairReading {
    internal let catalogue: InventoryCatalogueSnapshot?
    internal let referenceTargets: [InventoryProtocol2ReferenceTarget]
    internal let referenceLabel: (InventoryReferenceValue) -> String?

    internal init(
        catalogue: InventoryCatalogueSnapshot?,
        referenceTargets: [InventoryProtocol2ReferenceTarget] = [],
        referenceLabel: @escaping (InventoryReferenceValue) -> String?
    ) {
        self.catalogue = catalogue
        self.referenceTargets = referenceTargets
        self.referenceLabel = referenceLabel
    }

    internal func detail(_ repair: InventoryRepair) -> InventoryCatalogueRepairDetail? {
        guard repair.kind == .catalogueChanged else { return nil }
        let changes = repair.catalogue?.changes ?? []
        let stale = repair.catalogue?.staleReference
        let queued = InventoryQueuedChange(repair.catalogue?.queued)
        var carried = queued.values.map { valueRow($0, changes, stale: stale, assumed: false) }
        if stale != nil, !carried.contains(where: \.fit.isStaleReference) {
            carried = queued.values.map { valueRow($0, changes, stale: stale, assumed: true) }
        }
        let values =
            typeRow(queued, changes) + carried + requiredRows(queued)
            + unknownRows(queued, changes)
        let copy = InventoryCatalogueRepairCopy(reading: self, noun: queued.noun)
        return InventoryCatalogueRepairDetail(
            title: queued.title,
            problem: copy.problem(changes: changes, values: values, staleReference: stale),
            values: values,
            definitionsChanged: repair.catalogue?.definitionsChanged ?? false,
            refusal: values.first { $0.fit.blocks }.map(copy.refusal))
    }

    internal func field(_ id: String) -> InventoryCatalogueField? {
        catalogue?.types.lazy.flatMap(\.fields).first { $0.id == id }
    }

    internal func type(_ id: String) -> InventoryCatalogueType? {
        catalogue?.types.first { $0.id == id }
    }

    internal func option(_ id: String) -> InventoryCatalogueOption? {
        catalogue?.types.lazy.flatMap(\.fields).flatMap(\.enumOptions).first { $0.id == id }
    }

    /// The label of a replacement, field or type.
    internal func label(of id: String) -> String? {
        field(id)?.label ?? type(id)?.label
    }

    private func typeRow(
        _ queued: InventoryQueuedChange, _ changes: [InventoryCatalogueChange]
    ) -> [InventoryQueuedValue] {
        guard let typeId = queued.typeId else { return [] }
        let named = changes.first { $0.definition == .type && $0.id == typeId }
        let fit: InventoryFieldFit
        if let type = type(typeId) {
            fit = type.archivedAt == nil ? .fits : archivedFit(named)
        } else {
            fit = .notOnPhone
        }
        guard fit.blocks || named != nil else { return [] }
        return [
            InventoryQueuedValue(
                id: "type", field: "Type", value: type(typeId)?.label ?? "A newer type", fit: fit)
        ]
    }

    /// `assumed` marks every reference value with `stale`, for when none
    /// is out of the pickers' reach on this phone.
    private func valueRow(
        _ value: InventoryQueuedChange.Value, _ changes: [InventoryCatalogueChange],
        stale: InventoryStaleReference?, assumed: Bool
    ) -> InventoryQueuedValue {
        guard let field = field(value.fieldId) else {
            return InventoryQueuedValue(
                id: value.fieldId, field: "A newer field",
                value: value.values.map(InventoryProtocol2ValueText.input).joined(separator: " · "),
                fit: .notOnPhone)
        }
        let named = changes.first { $0.id == field.id }
        var fit = fit(of: value, field, named)
        if fit == .fits, let stale {
            fit = referenceFit(value.values, field, stale: stale, assumed: assumed) ?? .fits
        }
        let shown = fit == .recordGone ? value.values.map(unnamedAsMissing) : value.values
        return InventoryQueuedValue(
            id: field.id, field: field.label, value: valueText(shown, field: field), fit: fit)
    }

    /// A reference this phone has no name for, read as missing rather than
    /// by its id.
    private func unnamedAsMissing(_ value: InventoryPrimitiveValue) -> InventoryPrimitiveValue {
        guard case .reference(let reference) = value, referenceLabel(reference) == nil else {
            return value
        }
        return .reference(
            InventoryReferenceValue(
                targetKind: reference.targetKind, targetId: reference.targetId,
                targetState: .missing))
    }

    private func referenceFit(
        _ values: [InventoryPrimitiveValue], _ field: InventoryCatalogueField,
        stale: InventoryStaleReference, assumed: Bool
    ) -> InventoryFieldFit? {
        let references = values.compactMap { value -> InventoryReferenceValue? in
            guard case .reference(let reference) = value else { return nil }
            return reference
        }
        guard !references.isEmpty else { return nil }
        if assumed { return stale == .targetMissing ? .recordGone : .recordNotAllowed }
        let offered = InventoryProtocol2ReferenceTargets.allowed(
            for: field, among: referenceTargets)
        let outOfReach = references.first { reference in
            !offered.contains { $0.names(reference) }
        }
        guard let outOfReach else { return nil }
        let live = referenceTargets.contains { $0.names(outOfReach) }
        return live ? .recordNotAllowed : .recordGone
    }

    /// The value as it was queued. A choice reads as its option's label,
    /// without the "(Retired)" a detail row adds, since the row's own mark
    /// already says so.
    private func valueText(
        _ values: [InventoryPrimitiveValue], field: InventoryCatalogueField
    ) -> String {
        guard !values.isEmpty else { return "Cleared" }
        guard field.kind == .enumeration else {
            return InventoryProtocol2Display.text(
                for: values, field: field, referenceLabel: referenceLabel)
        }
        return values.map { value in
            guard case .enumeration(let optionId) = value else {
                return InventoryProtocol2ValueText.input(value)
            }
            return field.enumOptions.first { $0.id == optionId }?.label ?? optionId
        }.joined(separator: " · ")
    }

    private func fit(
        of value: InventoryQueuedChange.Value, _ field: InventoryCatalogueField,
        _ named: InventoryCatalogueChange?
    ) -> InventoryFieldFit {
        if field.archivedAt != nil { return archivedFit(named) }
        if named?.change == .redefined { return .changedKind(to: Self.kindWords(field.kind)) }
        let retired = value.values.contains { primitive in
            guard case .enumeration(let optionId) = primitive else { return false }
            return field.enumOptions.first { $0.id == optionId }?.archivedAt != nil
        }
        return retired ? .optionRetired : .fits
    }

    private func archivedFit(_ named: InventoryCatalogueChange?) -> InventoryFieldFit {
        guard named?.change == .replaced, let replacement = named?.replacementId else {
            return .archived
        }
        return .replaced(by: label(of: replacement) ?? "a newer definition")
    }

    private func requiredRows(_ queued: InventoryQueuedChange) -> [InventoryQueuedValue] {
        guard queued.suppliesEveryField, let typeId = queued.typeId, let type = type(typeId)
        else { return [] }
        let supplied = Set(queued.values.map(\.fieldId))
        return type.fields.filter {
            $0.required && $0.storage == .stored && $0.archivedAt == nil
                && !supplied.contains($0.id)
        }.map {
            InventoryQueuedValue(id: $0.id, field: $0.label, value: "Not set", fit: .nowRequired)
        }
    }

    private func unknownRows(
        _ queued: InventoryQueuedChange, _ changes: [InventoryCatalogueChange]
    ) -> [InventoryQueuedValue] {
        let carried = Set(queued.values.map(\.fieldId))
        return changes.filter {
            $0.definition == .field && field($0.id) == nil && !carried.contains($0.id)
        }.map {
            InventoryQueuedValue(
                id: $0.id, field: "A newer field", value: "Not set", fit: .notOnPhone)
        }
    }

    /// A kind in words, for "Now a number".
    internal static func kindWords(_ kind: InventoryPrimitiveKind) -> String {
        switch kind {
        case .shortText, .longText: "text"
        case .integer: "a whole number"
        case .decimal: "a number"
        case .date: "a date"
        case .dateTime: "a date and time"
        case .url: "a link"
        case .measurement: "a measurement"
        case .reference: "a record"
        case .boolean: "yes or no"
        case .enumeration: "a choice"
        }
    }
}

/// The protocol-2 command a catalogue repair holds, as the rows read it.
internal struct InventoryQueuedChange {
    struct Value {
        let fieldId: String
        let values: [InventoryPrimitiveValue]
    }

    let title: String
    /// What the change is, in the problem line: "This edit needs newer fields".
    let noun: String
    let typeId: String?
    let values: [Value]
    /// A new item and a type change carry every field, so a required one
    /// left out is in the way; an edit only touches the fields it names.
    let suppliesEveryField: Bool

    init(_ command: InventoryCommand?) {
        switch command {
        case .createProtocol2Item(let item)?:
            self.init(
                title: "Queued new item", noun: "new item", typeId: item.typeId,
                values: item.values.map { Value(fieldId: $0.fieldId, values: $0.values) },
                suppliesEveryField: true)
        case .editProtocol2Item(_, _, let patches)?:
            self.init(
                title: "Queued edit", noun: "edit", typeId: nil,
                values: patches.map { Value(fieldId: $0.fieldId, values: $0.values ?? []) },
                suppliesEveryField: false)
        case .changeProtocol2ItemType(_, _, let typeId, let values)?:
            self.init(
                title: "Queued type change", noun: "type change", typeId: typeId,
                values: values.map { Value(fieldId: $0.fieldId, values: $0.values) },
                suppliesEveryField: true)
        default:
            self.init(
                title: "Queued change", noun: "change", typeId: nil, values: [],
                suppliesEveryField: false)
        }
    }

    private init(
        title: String, noun: String, typeId: String?, values: [Value], suppliesEveryField: Bool
    ) {
        self.title = title
        self.noun = noun
        self.typeId = typeId
        self.values = values
        self.suppliesEveryField = suppliesEveryField
    }
}
