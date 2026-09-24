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
///
/// A definition the server named as replaced (``AppCore/InventoryCatalogueChange``
/// with a `replacementId`), or that the newer revision records a replacement
/// for, is first moved onto its replacement when that accepts the value
/// (``CatalogueReplacement``); only what is still in the way after that
/// refuses the move.
internal enum CatalogueRebase {
    enum Verdict: Equatable {
        /// `revision` is what the moved change is sent with
        /// (`InventoryCommand.sentCatalogueRevision(active:)`).
        case rebased(LoggedCommand, revision: Int?)
        /// The change still names something the newer revision no longer
        /// has as it was, first cause first.
        case incompatible([InventoryCatalogueChange])
    }

    /// The change moved onto `revision`, or why it cannot move. A change
    /// that names no catalogue record (every protocol-1 command) always
    /// moves.
    ///
    /// - Parameter known: What the server named as standing in the way, whose
    ///   replacements are tried first and which are reported as they were
    ///   named when the move still fails on them.
    static func rebase(
        _ entry: LogEntry, onto revision: Int, known: [InventoryCatalogueChange] = [],
        in db: Database
    ) throws -> Verdict {
        guard case .command(var command) = entry.command else {
            return .rebased(entry.command, revision: nil)
        }
        guard let authoredRevision = command.protocol2CatalogueRevision else {
            return .rebased(
                entry.command, revision: command.sentCatalogueRevision(active: revision))
        }
        guard let target = try Protocol2CatalogueRows.read(revision: revision, in: db) else {
            return .incompatible([
                InventoryCatalogueChange(
                    definition: .revision, id: String(revision), change: .notInRevision,
                    revision: revision)
            ])
        }
        let authored = try Protocol2CatalogueRows.read(revision: authoredRevision, in: db)
        let itemTypeId = try CatalogueCompatibility.typeId(ofItem: command.entityId, in: db)
        let replacement = CatalogueReplacement(authored: authored, target: target)
        let replacements =
            known
            + replacement.recorded(for: command).filter { recorded in
                !known.contains { $0.id == recorded.id && $0.isReplacement }
            }
        let moved = replacement.move(command, along: replacements, itemTypeId: itemTypeId)
        command = moved.command
        let check = CatalogueCompatibility(authored: authored, target: target)
        let found = check.incompatibility(of: command, itemTypeId: itemTypeId)
        if let found {
            let named = replacements.first { $0.id == found.id && $0.change == .replaced }
            return .incompatible([named ?? found] + moved.refused.filter { $0.id != found.id })
        }
        if let refused = moved.refused.first {
            return .incompatible([refused])
        }
        return .rebased(.command(command.movedTo(catalogueRevision: revision)), revision: revision)
    }
}

extension InventoryCatalogueChange {
    /// The change in words for a log line or an error message; the screens
    /// word it themselves, with labels.
    var summary: String {
        let subject =
            definition == .revision ? "catalogue revision \(id)" : "\(definition.wireValue) \(id)"
        switch change {
        case .archived: return "\(subject) was archived"
        case .replaced: return "\(subject) was replaced"
        case .retired: return "\(subject) was retired"
        case .nowRequired: return "\(subject) is now required"
        case .notInRevision: return "\(subject) is not in catalogue revision \(revision)"
        case .redefined: return "\(subject) changed kind"
        case .needsNewerApp: return "\(subject) needs a newer app"
        case .unrecognised(let kind): return "\(subject): \(kind)"
        }
    }
}

extension [InventoryCatalogueChange] {
    var summary: String {
        map(\.summary).joined(separator: "; ")
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
