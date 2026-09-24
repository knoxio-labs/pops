import AppCore

/// The words a `catalogueChanged` repair says, as the approved design says
/// them: the problem names the definition and what happened to it ("Shielding
/// was archived", "Screen size was replaced by Diagonal", "Socket no longer
/// allows Hallway"), and a refused Retry names what is still in the way.
internal struct InventoryCatalogueRepairCopy {
    internal let reading: InventoryCatalogueRepairReading
    /// The change in the problem line: edit, new item, type change.
    internal let noun: String

    /// The problem from the first definition the server named, or failing
    /// that the first value in the way, or failing both the generic line for
    /// what the server refused.
    internal func problem(
        changes: [InventoryCatalogueChange], values: [InventoryQueuedValue],
        staleReference: InventoryStaleReference?
    ) -> String {
        if let named = changes.first, let line = line(for: named) { return line }
        if let blocking = values.first(where: { $0.fit.blocks }) { return line(for: blocking) }
        switch staleReference {
        case .targetMissing: return "A record this \(noun) links to is no longer in Inventory"
        case .typeNotAllowed: return "A record this \(noun) links to is no longer allowed"
        case nil: return "A field this change used was archived or replaced."
        }
    }

    /// What Retry says when `value` still stops the change.
    internal func refusal(_ value: InventoryQueuedValue) -> String {
        switch value.fit {
        case .fits: "Nothing was sent."
        case .archived: "\(value.field) is still archived, so nothing was sent."
        case .replaced: "\(value.field) is still replaced, so nothing was sent."
        case .optionRetired: "\(value.value) is still retired, so nothing was sent."
        case .changedKind: "\(value.field) still holds another kind, so nothing was sent."
        case .nowRequired: "\(value.field) is still required, so nothing was sent."
        case .notOnPhone: "The new fields have not arrived yet. Try again after Sync."
        case .recordGone:
            "\(value.field) still links to a record no longer in Inventory, so nothing was sent."
        case .recordNotAllowed:
            "\(value.field) still does not allow \(value.value), so nothing was sent."
        }
    }

    private var needsNewerFields: String { "This \(noun) needs newer fields" }

    private func line(for change: InventoryCatalogueChange) -> String? {
        guard let label = label(of: change) else { return needsNewerFields }
        switch change.change {
        case .archived: return "\(label) was archived"
        case .replaced:
            let replacement = change.replacementId.flatMap(reading.label(of:)) ?? "a newer one"
            return "\(label) was replaced by \(replacement)"
        case .retired:
            let field = change.fieldId.flatMap { reading.field($0)?.label }
            return field.map { "\(label) was retired from \($0)" } ?? "\(label) was retired"
        case .nowRequired: return "\(label) is now required"
        case .redefined: return "\(label) changed"
        case .notInRevision, .needsNewerApp, .unrecognised: return needsNewerFields
        }
    }

    private func label(of change: InventoryCatalogueChange) -> String? {
        switch change.definition {
        case .field: reading.field(change.id)?.label
        case .type: reading.type(change.id)?.label
        case .option: reading.option(change.id)?.label
        case .revision, .unrecognised: nil
        }
    }

    private func line(for value: InventoryQueuedValue) -> String {
        switch value.fit {
        case .fits: "A field this change used was archived or replaced."
        case .archived: "\(value.field) was archived"
        case .replaced(let replacement): "\(value.field) was replaced by \(replacement)"
        case .optionRetired: "\(value.value) was retired from \(value.field)"
        case .changedKind: "\(value.field) changed"
        case .nowRequired: "\(value.field) is now required"
        case .notOnPhone: needsNewerFields
        case .recordGone: "\(value.field) links to a record no longer in Inventory"
        case .recordNotAllowed: "\(value.field) no longer allows \(value.value)"
        }
    }
}
