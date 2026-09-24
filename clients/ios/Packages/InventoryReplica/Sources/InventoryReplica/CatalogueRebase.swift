import AppCore
import GRDB

/// Moving a logged change from the catalogue revision it was authored
/// against onto a newer one (POPS-4405), inside the caller's transaction.
///
/// Only the schema is judged here: the change may move when every type,
/// field and enum option it names still exists in the newer revision, is
/// not archived there, and keeps its kind, cardinality and storage (a
/// relabel or a new optional field is compatible; a replaced or archived
/// field is not). The values themselves are the server's to judge once the
/// change arrives at the newer revision.
internal enum CatalogueRebase {
    enum Verdict: Equatable {
        /// `revision` is what the moved change is sent with
        /// (`InventoryCommand.sentCatalogueRevision(active:)`).
        case rebased(LoggedCommand, revision: Int?)
        /// The change still names something the newer revision no longer
        /// has as it was; `reason` says what, for the repair's message.
        case incompatible(reason: String)
    }

    /// The change moved onto `revision`, or why it cannot move. A change
    /// that names no catalogue record (every protocol-1 command) always
    /// moves.
    static func rebase(_ entry: LogEntry, onto revision: Int, in db: Database) throws -> Verdict {
        guard case .command(let command) = entry.command else {
            return .rebased(entry.command, revision: nil)
        }
        guard let authoredRevision = command.protocol2CatalogueRevision else {
            return .rebased(entry.command, revision: command.sentCatalogueRevision(active: revision))
        }
        guard let target = try Protocol2CatalogueRows.read(revision: revision, in: db) else {
            return .incompatible(reason: "catalogue revision \(revision) is not on this phone")
        }
        let authored = try Protocol2CatalogueRows.read(revision: authoredRevision, in: db)
        let check = Check(authored: authored, target: target)
        if let reason = try check.incompatibility(of: command, in: db) {
            return .incompatible(reason: reason)
        }
        return .rebased(.command(command.movedTo(catalogueRevision: revision)), revision: revision)
    }

    private struct Check {
        let authored: InventoryCatalogueSnapshot?
        let target: InventoryCatalogueSnapshot

        func incompatibility(of command: InventoryCommand, in db: Database) throws -> String? {
            switch command {
            case .createProtocol2Item(let new):
                return incompatibility(
                    typeId: new.typeId, fieldIds: new.values.map(\.fieldId),
                    values: new.values.flatMap(\.values), requiresAll: true)
            case .editProtocol2Item(let id, _, let patches):
                guard let typeId = try Self.typeId(ofItem: id, in: db) else {
                    return "item \(id) has no catalogue type"
                }
                return incompatibility(
                    typeId: typeId, fieldIds: patches.map(\.fieldId),
                    values: patches.flatMap { $0.values ?? [] }, requiresAll: false)
            case .changeProtocol2ItemType(_, _, let typeId, let values):
                return incompatibility(
                    typeId: typeId, fieldIds: values.map(\.fieldId),
                    values: values.flatMap(\.values), requiresAll: true)
            default:
                return nil
            }
        }

        private func incompatibility(
            typeId: String, fieldIds: [String], values: [InventoryPrimitiveValue],
            requiresAll: Bool
        ) -> String? {
            guard let type = target.types.first(where: { $0.id == typeId }),
                type.archivedAt == nil
            else { return "type \(typeId) was archived or replaced" }
            let fields = Dictionary(uniqueKeysWithValues: type.fields.map { ($0.id, $0) })
            let before = authored?.types.first { $0.id == typeId }.map { authoredType in
                Dictionary(uniqueKeysWithValues: authoredType.fields.map { ($0.id, $0) })
            }
            for fieldId in fieldIds {
                guard let field = fields[fieldId], field.archivedAt == nil,
                    field.storage == .stored
                else { return "field \(fieldId) was archived or replaced" }
                if let old = before?[fieldId],
                    old.kind != field.kind || old.cardinality != field.cardinality
                {
                    return "field \(fieldId) changed kind"
                }
            }
            let liveOptions = Set(
                type.fields.flatMap(\.enumOptions).filter { $0.archivedAt == nil }.map(\.id))
            for case .enumeration(let optionId) in values where !liveOptions.contains(optionId) {
                return "option \(optionId) was archived or replaced"
            }
            guard requiresAll else { return nil }
            let supplied = Set(fieldIds)
            for field in type.fields
            where field.required && field.storage == .stored && field.archivedAt == nil
                && !supplied.contains(field.id)
            {
                return "field \(field.id) is now required"
            }
            return nil
        }

        private static func typeId(ofItem id: String, in db: Database) throws -> String? {
            try String.fetchOne(
                db,
                sql: """
                    SELECT COALESCE(
                        (SELECT type_id FROM item_base WHERE id = ?),
                        (SELECT type_id FROM item WHERE id = ?))
                    """, arguments: [id, id])
        }
    }
}

extension InventoryCommand {
    /// The catalogue revision this command is sent with, given the one the
    /// replica holds (`active`): the revision a protocol-2 command was
    /// authored against; the active one for an override or a split, whose
    /// outcome on the server depends on the catalogue; and none for any other
    /// protocol-1 command, which the server judges without one (and refuses
    /// alongside a type key or named fields). Never a revision this phone did
    /// not hold (POPS-4492).
    func sentCatalogueRevision(active: Int?) -> Int? {
        if let authored = protocol2CatalogueRevision { return authored }
        switch self {
        case .setComputedOverride, .clearComputedOverride, .splitItem: return active
        default: return nil
        }
    }

    /// This command authored against `catalogueRevision` instead; a command
    /// that carries no revision is returned as it is.
    func movedTo(catalogueRevision revision: Int) -> InventoryCommand {
        switch self {
        case .createProtocol2Item(let new):
            .createProtocol2Item(
                InventoryNewProtocol2Item(
                    id: new.id, name: new.name, catalogueRevision: revision, typeId: new.typeId,
                    values: new.values, note: new.note, externalIds: new.externalIds,
                    quantity: new.quantity, placement: new.placement))
        case .editProtocol2Item(let id, _, let values):
            .editProtocol2Item(id: id, catalogueRevision: revision, values: values)
        case .changeProtocol2ItemType(let id, _, let typeId, let values):
            .changeProtocol2ItemType(
                id: id, catalogueRevision: revision, typeId: typeId, values: values)
        default:
            self
        }
    }
}
