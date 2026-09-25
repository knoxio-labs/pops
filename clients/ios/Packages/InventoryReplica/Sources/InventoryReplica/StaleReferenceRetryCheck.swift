import AppCore
import GRDB

extension InventoryStaleReference {
    /// The wire reason Retry's local refusal carries, matching what the
    /// server would answer for the same target.
    internal var rejectedReason: InventoryRejectedReason {
        switch self {
        case .targetMissing: .targetMissing
        case .typeNotAllowed: .referenceTypeMismatch
        }
    }

    /// Copy in the spirit of the catalogue repair screen's own refusal text
    /// (`InventoryCatalogueRepairCopy.refusal`), for a refusal this phone
    /// makes itself rather than relays from the server.
    internal var retryRefusalMessage: String {
        switch self {
        case .targetMissing:
            "the referenced record is no longer in Inventory, so nothing was sent"
        case .typeNotAllowed:
            "the referenced record is no longer of a type this field allows, so nothing was sent"
        }
    }
}

/// Whether Retry may resend a stale-reference `catalogueChanged` repair
/// unchanged (POPS-4617). `CatalogueRebase` only judges schema; it re-sends
/// the exact reference value the server refused before, unless this phone
/// can show the target is live and, for a type refusal, of an allowed type
/// now. When it cannot show that, Retry must refuse locally rather than
/// round-trip the same refusal into a new repair.
internal enum StaleReferenceRetryCheck {
    /// The first reference value `command` carries that this phone can tell
    /// is still out of its field's reach, or nil when every reference is
    /// provably live and of an allowed type. A target this phone has not
    /// synced down at all is not provably live, so it counts as still stale
    /// here — the server gets to answer again, not Retry pre-empting it with
    /// a guess.
    static func stillStale(
        _ command: InventoryCommand, onto revision: Int, in db: Database
    ) throws -> InventoryStaleReference? {
        let references = command.referenceFieldValues
        guard !references.isEmpty,
            let catalogue = try Protocol2CatalogueRows.read(revision: revision, in: db)
        else { return nil }
        for (fieldId, reference) in references {
            guard
                let field = catalogue.types.lazy.flatMap(\.fields)
                    .first(where: { $0.id == fieldId })
            else { continue }
            if let stale = try stillStale(reference, for: field, in: db) { return stale }
        }
        return nil
    }

    private static func stillStale(
        _ reference: InventoryReferenceValue, for field: InventoryCatalogueField, in db: Database
    ) throws -> InventoryStaleReference? {
        guard let target = try targetRow(reference, in: db) else {
            return .targetMissing
        }
        if target.deleted { return .targetMissing }
        guard field.references.targetKinds.contains(reference.targetKind) else {
            return .typeNotAllowed
        }
        guard reference.targetKind == .item, !field.references.targetTypeIds.isEmpty else {
            return nil
        }
        guard let typeId = target.typeId, field.references.targetTypeIds.contains(typeId) else {
            return .typeNotAllowed
        }
        return nil
    }

    private struct TargetRow {
        let deleted: Bool
        let typeId: String?
    }

    /// This phone's own row for `reference`'s target, or nil when it has not
    /// synced one down (never seen it, or not yet — this build cannot tell
    /// the two apart, and treats both as "not provably live").
    private static func targetRow(
        _ reference: InventoryReferenceValue, in db: Database
    ) throws -> TargetRow? {
        switch reference.targetKind {
        case .item:
            guard
                let row = try Row.fetchOne(
                    db, sql: "SELECT deleted_at, type_id FROM item WHERE id = ?",
                    arguments: [reference.targetId])
            else { return nil }
            let deletedAt: Double? = row["deleted_at"]
            let typeId: String? = row["type_id"]
            return TargetRow(deleted: deletedAt != nil, typeId: typeId)
        case .location:
            guard
                let row = try Row.fetchOne(
                    db, sql: "SELECT deleted_at FROM location WHERE id = ?",
                    arguments: [reference.targetId])
            else { return nil }
            let deletedAt: Double? = row["deleted_at"]
            return TargetRow(deleted: deletedAt != nil, typeId: nil)
        }
    }
}
