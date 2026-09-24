import AppCore

/// `InventoryMutationOutcome`'s storage twin, for the log's `outcome`
/// column: kept whole, because the repair a conflict or a rejection opens is
/// built from it.
internal enum StoredOutcome: Codable, Equatable {
    case applied(revision: Int, seq: Int, converged: Bool)
    case conflictField(
        field: String, mine: String, theirs: String, source: StoredSyncSource, at: Double,
        currentRevision: Int)
    case conflictCodeCollision(heldById: String, heldByName: String, suggestedCode: String)
    case conflictDeleted(source: StoredSyncSource, at: Double)
    /// `catalogueChanges` is absent from a row written before they were
    /// kept, and for every refusal that names none.
    case rejected(reason: String, message: String, catalogueChanges: [StoredCatalogueChange]?)
    case deferred(waitingOn: String)

    init(_ outcome: InventoryMutationOutcome) {
        switch outcome {
        case .applied(let revision, let seq, let converged):
            self = .applied(revision: revision, seq: seq, converged: converged)
        case .conflictField(let field, let mine, let theirs, let source, let at, let revision):
            self = .conflictField(
                field: field, mine: mine, theirs: theirs, source: StoredSyncSource(source),
                at: storedDate(at), currentRevision: revision)
        case .conflictCodeCollision(let id, let name, let suggestedCode):
            self = .conflictCodeCollision(
                heldById: id, heldByName: name, suggestedCode: suggestedCode)
        case .conflictDeleted(let source, let at):
            self = .conflictDeleted(source: StoredSyncSource(source), at: storedDate(at))
        case .rejected(let reason, let message, let changes):
            self = .rejected(
                reason: reason.storageValue, message: message,
                catalogueChanges: changes.isEmpty ? nil : changes.map(StoredCatalogueChange.init))
        case .deferred(let waitingOn):
            self = .deferred(waitingOn: waitingOn)
        }
    }

    /// The log state this outcome leaves its mutation in.
    var state: MutationState {
        switch self {
        case .applied: .applied
        case .conflictField, .conflictCodeCollision, .conflictDeleted: .conflicted
        case .rejected: .rejected
        case .deferred: .deferred
        }
    }

    var appliedRevision: Int? {
        guard case .applied(let revision, _, _) = self else { return nil }
        return revision
    }

    var appliedSeq: Int? {
        guard case .applied(_, let seq, _) = self else { return nil }
        return seq
    }
}

extension StoredOutcome {
    /// What a catalogue refusal named as standing in the way; empty for any
    /// other outcome.
    var catalogueChanges: [InventoryCatalogueChange] {
        guard case .rejected(_, _, let changes?) = self else { return [] }
        return changes.map(\.value)
    }
}

/// ``AppCore/InventoryCatalogueChange``'s storage twin, spelled as the wire
/// spells it so a kind this build does not know round-trips.
internal struct StoredCatalogueChange: Codable, Equatable {
    let definition: String
    let id: String
    let typeId: String?
    let fieldId: String?
    let change: String
    let replacementId: String?
    let revision: Int

    init(_ change: InventoryCatalogueChange) {
        definition = change.definition.wireValue
        id = change.id
        typeId = change.typeId
        fieldId = change.fieldId
        self.change = change.change.wireValue
        replacementId = change.replacementId
        revision = change.revision
    }

    var value: InventoryCatalogueChange {
        InventoryCatalogueChange(
            definition: InventoryCatalogueDefinition(wire: definition), id: id, typeId: typeId,
            fieldId: fieldId, change: InventoryCatalogueChangeKind(wire: self.change),
            replacementId: replacementId, revision: revision)
    }
}

internal enum StoredSyncSource: Codable, Equatable {
    case thisDevice
    case otherDevice(label: String)
    case web
    case service(account: String)
    case unrecognised(kind: String, label: String)

    init(_ source: InventorySyncSource) {
        switch source {
        case .thisDevice: self = .thisDevice
        case .otherDevice(let label): self = .otherDevice(label: label)
        case .web: self = .web
        case .service(let account): self = .service(account: account)
        case .unrecognised(let kind, let label): self = .unrecognised(kind: kind, label: label)
        }
    }
}

extension InventoryRejectedReason {
    /// The wire spelling, so an `.unrecognised` reason round-trips as it
    /// arrived.
    var storageValue: String {
        switch self {
        case .invalid: "invalid"
        case .typeUnknown: "type_unknown"
        case .cycle: "cycle"
        case .targetMissing: "target_missing"
        case .notContainer: "not_container"
        case .hasContents: "has_contents"
        case .illegalTransition: "illegal_transition"
        case .mediaMissing: "media_missing"
        case .catalogueUpdateRequired: "catalogue_update_required"
        case .catalogueRepairRequired: "catalogue_repair_required"
        case .unrecognised(let value): value
        }
    }
}
