import Foundation
import Testing

@testable import BFMClient

/// The bodies `/mobile/inventory/*` answers with, written as the JSON the BFM
/// actually sends — see ``TransactionsWire`` for why these are strings rather
/// than encoded generated types. Shapes are copied from
/// `pillars/inventory/src/contract/rest-sync-schemas.ts` and
/// `pillars/bfm/src/contract/mobile-inventory-schemas.ts`.
internal enum InventoryWire {
    internal static func placement(kind: String, id: String? = nil) -> String {
        switch kind {
        case "location": "{\"kind\":\"location\",\"locationId\":\"\(id ?? "loc-1")\"}"
        case "container": "{\"kind\":\"container\",\"itemId\":\"\(id ?? "item-box")\"}"
        default: "{\"kind\":\"hand\"}"
        }
    }

    internal static func item(
        id: String = "item-1",
        revision: Int = 1,
        seq: Int = 1,
        name: String = "Lamp",
        typeKey: String? = nil,
        fields: String = "{}",
        note: String? = nil,
        code: String? = nil,
        quantity: Int = 1,
        lifecycle: String = "active",
        lifecycleChangedAt: String? = nil,
        placement: String = placement(kind: "hand"),
        previousPlacement: String = "null",
        isContainer: Bool = false,
        access: String? = nil,
        isFull: String = "null",
        provenance: String = "null",
        documentsStatus: String = "none"
    ) -> String {
        """
        {"id":"\(id)","revision":\(revision),"seq":\(seq),"name":"\(name)",\
        "typeKey":\(typeKey.map { "\"\($0)\"" } ?? "null"),"fields":\(fields),\
        "note":\(note.map { "\"\($0)\"" } ?? "null"),"code":\(code.map { "\"\($0)\"" } ?? "null"),\
        "externalIds":[],"quantity":\(quantity),"lifecycle":"\(lifecycle)",\
        "lifecycleChangedAt":\(lifecycleChangedAt.map { "\"\($0)\"" } ?? "null"),\
        "placement":\(placement),"previousPlacement":\(previousPlacement),\
        "isContainer":\(isContainer),"access":\(access.map { "\"\($0)\"" } ?? "null"),\
        "isFull":\(isFull),"photos":[],"provenance":\(provenance),\
        "documentsStatus":"\(documentsStatus)","documentTitles":[],\
        "createdAt":"2026-09-01T00:00:00.000Z","updatedAt":"2026-09-01T00:00:00.000Z",\
        "deletedAt":null}
        """
    }

    internal static func location(
        id: String = "loc-1", revision: Int = 1, seq: Int = 1, name: String = "House",
        parentId: String? = nil
    ) -> String {
        """
        {"id":"\(id)","revision":\(revision),"seq":\(seq),"name":"\(name)",\
        "parentId":\(parentId.map { "\"\($0)\"" } ?? "null"),"sortOrder":0,"deletedAt":null}
        """
    }

    internal static func snapshot(
        items: [String] = [], locations: [String] = [], nextCursor: String = "null"
    ) -> String {
        """
        {"epoch":"epoch-1","highWaterSeq":10,"catalogueVersion":"v1","total":\(items.count),\
        "items":[\(items.joined(separator: ","))],"locations":[\(locations.joined(separator: ","))],\
        "nextCursor":\(nextCursor)}
        """
    }

    internal static func changes(
        items: [String] = [], locations: [String] = [], events: [String] = [],
        nextSince: Int = 11, hasMore: Bool = false
    ) -> String {
        """
        {"epoch":"epoch-1","items":[\(items.joined(separator: ","))],\
        "locations":[\(locations.joined(separator: ","))],"events":[\(events.joined(separator: ","))],\
        "nextSince":\(nextSince),"hasMore":\(hasMore),"catalogueVersion":"v1"}
        """
    }

    /// A `moved` history entry: `fields: ["placement","previousPlacement"]`,
    /// exactly what POPS-4111 asks this transport to decode as AppCore's own
    /// placement types rather than as opaque JSON.
    internal static func moveEvent(
        seq: Int = 1,
        entityId: String = "item-1",
        beforePlacement: String = placement(kind: "hand"),
        beforePreviousPlacement: String = "null",
        afterPlacement: String = placement(kind: "location"),
        afterPreviousPlacement: String = "null",
        actorKind: String = "device",
        actorLabel: String = "Fixture"
    ) -> String {
        """
        {"seq":\(seq),"entityKind":"item","entityId":"\(entityId)","kind":"moved",\
        "fields":["placement","previousPlacement"],\
        "before":{"placement":\(beforePlacement),"previousPlacement":\(beforePreviousPlacement)},\
        "after":{"placement":\(afterPlacement),"previousPlacement":\(afterPreviousPlacement)},\
        "reason":null,"actor":{"kind":"\(actorKind)","label":"\(actorLabel)"},\
        "clientTime":"2026-09-01T00:00:00.000Z","serverTime":"2026-09-01T00:00:01.000Z",\
        "compensatesSeq":null,"undoable":true}
        """
    }

    internal static func catalogue(
        version: String = "v1",
        units: [String] = ["{\"symbol\":\"kg\",\"dimension\":\"mass\",\"multiplier\":1}"],
        types: [String] = []
    ) -> String {
        """
        {"version":"\(version)","units":[\(units.joined(separator: ","))],\
        "types":[\(types.joined(separator: ","))]}
        """
    }

    internal static func appliedOutcome(
        mutationId: String, revision: Int = 2, seq: Int = 1, converged: Bool = false
    ) -> String {
        """
        {"mutationId":"\(mutationId)","status":"applied","revision":\(revision),"seq":\(seq),\
        "converged":\(converged)}
        """
    }

    internal static func fieldConflictOutcome(
        mutationId: String, field: String = "name", mine: String = "\"Lamp\"",
        theirs: String = "\"Light\"", sourceKind: String = "device", sourceLabel: String = "Other",
        currentRevision: Int = 3
    ) -> String {
        """
        {"mutationId":"\(mutationId)","status":"conflict","kind":"field","field":"\(field)",\
        "mine":\(mine),"theirs":\(theirs),\
        "source":{"kind":"\(sourceKind)","label":"\(sourceLabel)"},\
        "at":"2026-09-01T00:00:02.000Z","currentRevision":\(currentRevision)}
        """
    }

    internal static func codeCollisionOutcome(
        mutationId: String, heldById: String = "item-2", heldByName: String = "Other Lamp",
        suggestedCode: String? = "B413"
    ) -> String {
        """
        {"mutationId":"\(mutationId)","status":"conflict","kind":"code_collision",\
        "heldBy":{"id":"\(heldById)","name":"\(heldByName)"},\
        "suggestedCode":\(suggestedCode.map { "\"\($0)\"" } ?? "null")}
        """
    }

    internal static func deletedConflictOutcome(
        mutationId: String, sourceKind: String = "web", sourceLabel: String = "Server"
    ) -> String {
        """
        {"mutationId":"\(mutationId)","status":"conflict","kind":"deleted",\
        "source":{"kind":"\(sourceKind)","label":"\(sourceLabel)"},\
        "at":"2026-09-01T00:00:02.000Z"}
        """
    }

    internal static func rejectedOutcome(
        mutationId: String, reason: String = "cycle", message: String = "no"
    ) -> String {
        """
        {"mutationId":"\(mutationId)","status":"rejected","reason":"\(reason)","message":"\(message)"}
        """
    }

    internal static func deferredOutcome(mutationId: String, waitingOn: String) -> String {
        """
        {"mutationId":"\(mutationId)","status":"deferred","waitingOn":"\(waitingOn)"}
        """
    }

    internal static func mutationsResponse(_ outcomes: String..., highWaterSeq: Int = 20) -> String
    {
        """
        {"outcomes":[\(outcomes.joined(separator: ","))],"highWaterSeq":\(highWaterSeq)}
        """
    }

    internal static func forbidden(capability: String) -> String {
        """
        {"code":"capability_not_granted","message":"no","capability":"\(capability)"}
        """
    }

    internal static let deviceRevoked = """
        {"code":"device_revoked","message":"no"}
        """

    internal static func failure(code: String, message: String = "no") -> String {
        """
        {"code":"\(code)","message":"\(message)"}
        """
    }

    internal static func payloadTooLarge(maxBytes: Int = 262_144) -> String {
        """
        {"code":"payload_too_large","maxBytes":\(maxBytes),"message":"too big"}
        """
    }
}

extension BFMInventoryTransport {
    internal static func stubbed(_ transport: StubTransport) throws -> BFMInventoryTransport {
        BFMInventoryTransport(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            ),
            timeZone: { .gmt }
        )
    }
}
