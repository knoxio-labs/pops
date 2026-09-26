import AppCore
import Foundation
import OpenAPIRuntime

/// Maps `POST /mobile/inventory/mutations`'s response into
/// ``InventoryMutationBatchResult``.
///
/// One `OutcomesPayloadPayload` is `value1` (applied), `value2` (one of three
/// conflict shapes), `value3` (rejected) or `value4` (deferred) — the
/// generator's rendering of the producer's `z.union` of four disjoint object
/// shapes as four optional properties on one struct, since nothing in this
/// document is a discriminated union it can key a single Swift enum off.
internal enum BFMInventoryMutationsWire {
    private typealias Outcome =
        Operations.MobileInventory_mutations.Output.Ok.Body.JsonPayload.OutcomesPayloadPayload

    internal static func result(
        from payload: Operations.MobileInventory_mutations.Output.Ok.Body.JsonPayload
    ) -> InventoryMutationBatchResult {
        var outcomes: [String: InventoryMutationOutcome] = [:]
        for wire in payload.outcomes {
            if let (id, outcome) = self.outcome(from: wire) {
                outcomes[id] = outcome
            }
        }
        return InventoryMutationBatchResult(outcomes: outcomes, highWaterSeq: payload.highWaterSeq)
    }

    private static func outcome(from wire: Outcome) -> (String, InventoryMutationOutcome)? {
        if let applied = wire.value1 {
            return (
                applied.mutationId,
                .applied(revision: applied.revision, seq: applied.seq, converged: applied.converged)
            )
        }
        if let conflict = wire.value2 { return (conflictId(conflict), conflictOutcome(conflict)) }
        if let rejected = wire.value3 {
            return (
                rejected.mutationId,
                .rejected(
                    reason: InventoryRejectedReason(wire: rejected.reason),
                    message: rejected.message,
                    catalogueChanges: (rejected.catalogueChanges ?? []).map(catalogueChange),
                    incomingReference: rejected.incomingReference.map(incomingReference))
            )
        }
        if let deferred = wire.value4 {
            return (deferred.mutationId, .deferred(waitingOn: deferred.waitingOn))
        }
        return nil
    }

    /// Kinds this build does not know are kept as `unrecognised`, never
    /// dropped: the repair still says something is in the way.
    private static func catalogueChange(
        _ wire: Outcome.Value3Payload.CatalogueChangesPayloadPayload
    ) -> InventoryCatalogueChange {
        InventoryCatalogueChange(
            definition: InventoryCatalogueDefinition(wire: wire.definition), id: wire.id,
            typeId: wire.typeId, fieldId: wire.fieldId,
            change: InventoryCatalogueChangeKind(wire: wire.change),
            replacementId: wire.replacementId, revision: wire.revision)
    }

    private static func incomingReference(
        _ wire: Outcome.Value3Payload.IncomingReferencePayload
    ) -> InventoryIncomingReference {
        InventoryIncomingReference(itemId: wire.itemId, fieldId: wire.fieldId)
    }

    private static func conflictId(_ conflict: Outcome.Value2Payload) -> String {
        switch conflict {
        case .case1(let field): field.mutationId
        case .case2(let collision): collision.mutationId
        case .case3(let deleted): deleted.mutationId
        }
    }

    private static func conflictOutcome(_ conflict: Outcome.Value2Payload)
        -> InventoryMutationOutcome
    {
        switch conflict {
        case .case1(let field):
            .conflictField(
                field: field.field,
                mine: describe(field.mine),
                theirs: describe(field.theirs),
                source: source(kind: field.source.kind, label: field.source.label),
                at: ISO8601Instant.parse(field.at) ?? .distantPast,
                currentRevision: field.currentRevision
            )
        case .case2(let collision):
            .conflictCodeCollision(
                heldById: collision.heldBy.id, heldByName: collision.heldBy.name,
                suggestedCode: collision.suggestedCode ?? ""
            )
        case .case3(let deleted):
            .conflictDeleted(
                source: source(kind: deleted.source.kind, label: deleted.source.label),
                at: ISO8601Instant.parse(deleted.at) ?? .distantPast
            )
        }
    }

    /// A conflict's `mine`/`theirs` are unconstrained JSON on the wire
    /// (`outcomeWireSchema`'s own comment: the recursive schema does not
    /// project). Rendered as its JSON text rather than decoded into
    /// `InventoryFieldValue`, because a repair screen shows a value to
    /// compare, not a value to act on structurally.
    private static func describe(_ value: OpenAPIValueContainer) -> String {
        BFMInventoryJSONText.describe(value.value)
    }

    private static func source(kind: String, label: String) -> InventorySyncSource {
        switch kind {
        case "device": .otherDevice(label: label)
        case "web": .web
        case "service": .service(account: label)
        default: .unrecognised(kind: kind, label: label)
        }
    }
}
