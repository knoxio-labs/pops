import AppCore
import OpenAPIRuntime

/// Encodes an ``InventoryCommand`` into `POST /mobile/inventory/mutations`'s
/// `op` and `args`, mirroring `pillars/inventory/src/domain/commands/*.ts`
/// field for field — the arg shapes are read from
/// `pillars/inventory/contracts/command-vectors-v1.json`, generated straight
/// from those ops' own tests, rather than reconstructed by hand.
internal enum BFMInventoryCommandEncoding {
    /// The op name and entity id a mutation envelope needs alongside `args`.
    internal struct Envelope {
        internal let op: String
        internal let entityId: String
        internal let args: [String: (any Sendable)?]
    }

    /// A revert's entity is the reverted event's own (`event.revert`'s
    /// contract: "the mutation's entityId must be the event's entity"); its
    /// kind is not sent, because the server reads it off the event.
    internal static func envelope(for command: InventoryCommand) throws -> Envelope {
        Envelope(op: op(for: command), entityId: command.entityId, args: try args(for: command))
    }

    /// Split into groups purely to stay under this repo's cyclomatic-complexity
    /// cap — every case here is an equally weighted, independent mapping with
    /// no shared logic between them, the same reasoning
    /// `InventoryEventKind.byWireValue` gives for a lookup table over a
    /// `switch`; a `switch` reads plainer for a one-line-per-case mapping,
    /// so this keeps that shape split three ways instead.
    private static func op(for command: InventoryCommand) -> String {
        protocol2ItemWriteOp(for: command) ?? itemWriteOp(for: command)
            ?? itemAuxOp(for: command) ?? locationOrEventOp(for: command)
    }

    private static func itemWriteOp(for command: InventoryCommand) -> String? {
        switch command {
        case .createItem: "item.create"
        case .editItem: "item.edit"
        case .changeItemType: "item.changeType"
        case .setItemCode: "item.setCode"
        case .moveItem: "item.move"
        case .setItemAccess: "item.setAccess"
        case .setItemFull: "item.setFull"
        case .setItemLifecycle: "item.setLifecycle"
        case .setItemQuantity: "item.setQuantity"
        default: nil
        }
    }

    private static func itemAuxOp(for command: InventoryCommand) -> String? {
        switch command {
        case .splitItem: "item.split"
        case .attachPhoto: "item.attachPhoto"
        case .removePhoto: "item.removePhoto"
        case .reorderPhotos: "item.reorderPhotos"
        case .restoreDeletedItem: "item.restoreDeleted"
        case .deleteItem: "item.delete"
        case .setComputedOverride: "item.setOverride"
        case .clearComputedOverride: "item.clearOverride"
        default: nil
        }
    }

    private static func locationOrEventOp(for command: InventoryCommand) -> String {
        switch command {
        case .createLocation: "location.create"
        case .renameLocation: "location.rename"
        case .moveLocation: "location.move"
        case .deleteLocation: "location.delete"
        case .revertEvent: "event.revert"
        default:
            preconditionFailure("every other case is covered by itemWriteOp/itemAuxOp")
        }
    }

    private static func args(for command: InventoryCommand) throws -> [String: (any Sendable)?] {
        if let args = try protocol2ItemWriteArgs(for: command) { return args }
        if let args = try itemWriteArgs(for: command) { return args }
        if let args = try itemAuxArgs(for: command) { return args }
        return try locationOrEventArgs(for: command)
    }

    private static func itemWriteArgs(
        for command: InventoryCommand
    ) throws -> [String: (any Sendable)?]? {
        switch command {
        case .createItem(let item): try ["item": itemArgs(item)]
        case .editItem(_, let name, let note, let fields, let externalIds):
            try editArgs(name: name, note: note, fields: fields, externalIds: externalIds)
        case .changeItemType(_, let typeKey, let fields):
            try ["typeKey": typeKey, "fields": fieldsBlob(fields)]
        case .setItemCode(_, let code): ["code": code]
        case .moveItem(_, let to, let verb): ["to": placementArgs(to), "verb": verb.wireValue]
        case .setItemAccess(_, let access): ["access": access.wireValue]
        case .setItemFull(_, let isFull): ["full": isFull]
        case .setItemLifecycle(_, let lifecycle, let reason):
            ["lifecycle": lifecycle.wireValue, "reason": reason?.wireValue]
        case .setItemQuantity(_, let quantity): ["quantity": quantity]
        default: nil
        }
    }

    private static func itemAuxArgs(
        for command: InventoryCommand
    ) throws -> [String: (any Sendable)?]? {
        switch command {
        case .splitItem(_, let newItemId, let quantity):
            ["newItemId": newItemId, "quantity": quantity]
        case .attachPhoto(_, let sha256, let position): ["sha256": sha256, "position": position]
        case .removePhoto(_, let sha256): ["sha256": sha256]
        case .reorderPhotos(_, let sha256s): ["sha256s": sha256s]
        case .restoreDeletedItem, .deleteItem: [:]
        case .setComputedOverride(_, let fieldId, let value):
            try ["fieldId": fieldId, "values": [protocol2Value(value)]]
        case .clearComputedOverride(_, let fieldId): ["fieldId": fieldId]
        default: nil
        }
    }

    private static func locationOrEventArgs(
        for command: InventoryCommand
    ) throws -> [String: (any Sendable)?] {
        switch command {
        case .createLocation(let location):
            ["location": ["name": location.name, "parentId": location.parentId]]
        case .renameLocation(_, let name): ["name": name]
        case .moveLocation(_, let parentId): ["parentId": parentId]
        case .deleteLocation: [:]
        case .revertEvent(let seq, _, _): ["seq": seq]
        default:
            preconditionFailure("every other case is covered by itemWriteArgs/itemAuxArgs")
        }
    }

    private static func itemArgs(_ item: InventoryNewItem) throws -> [String: (any Sendable)?] {
        try [
            "name": item.name,
            "typeKey": item.typeKey,
            "fields": fieldsBlob(item.fields),
            "note": item.note,
            "externalIds": externalIdArgs(item.externalIds),
            "quantity": item.quantity,
            "placement": placementArgs(item.placement),
        ]
    }

    /// `note` and `fields` follow `item.edit`'s own patch semantics
    /// (`pillars/inventory/src/domain/commands/item-edit.ts`): an absent key
    /// leaves the field untouched, so ``InventoryFieldUpdate/unchanged`` and
    /// an empty `fields` patch omit the key entirely rather than sending it
    /// as `null`. `externalIds` replaces the whole list when present, so `nil`
    /// omits the key rather than clearing the list.
    private static func editArgs(
        name: String?, note: InventoryFieldUpdate<String>, fields: [String: InventoryFieldValue?],
        externalIds: [InventoryExternalIdentifier]?
    ) throws -> [String: (any Sendable)?] {
        var args: [String: (any Sendable)?] = [:]
        if let name { args["name"] = name }
        switch note {
        case .unchanged: break
        case .set(let value): args["note"] = value
        case .cleared: args.updateValue(nil, forKey: "note")
        }
        if !fields.isEmpty { args["fields"] = try fieldsPatch(fields) }
        if let externalIds { args["externalIds"] = externalIdArgs(externalIds) }
        return args
    }

    internal static func externalIdArgs(_ ids: [InventoryExternalIdentifier]) -> [(any Sendable)?] {
        ids.map { ["kind": $0.kind, "value": $0.value] }
    }

    internal static func placementArgs(_ placement: InventoryPlacement) -> [String: (any Sendable)?]
    {
        switch placement {
        case .location(let id): ["kind": "location", "locationId": id]
        case .container(let id): ["kind": "container", "itemId": id]
        case .hand: ["kind": "hand"]
        }
    }

    private static func fieldsBlob(
        _ fields: [String: InventoryFieldValue]
    ) throws -> [String: (any Sendable)?] {
        try fields.mapValues { try BFMInventoryFieldValueWire.encode($0).value }
    }

    private static func fieldsPatch(
        _ fields: [String: InventoryFieldValue?]
    ) throws -> [String: (any Sendable)?] {
        try fields.mapValues { value in
            guard let value else { return nil }
            return try BFMInventoryFieldValueWire.encode(value).value
        }
    }
}
