import AppCore
import Foundation

/// Turns a vector's seed and mutation into the domain values the replica
/// takes. A malformed vector or an op with no mapping fails the test that
/// asked, naming it, rather than being skipped.
internal enum CommandVectorDecoding {
    struct Malformed: Error, CustomStringConvertible {
        let description: String
    }

    static let clock = Date(timeIntervalSinceReferenceDate: 800_000_000)

    /// The server's own catalogue as far as the vectors reach: `bulb` and
    /// its `Fitting` choice (`pillars/inventory/src/types/templates/bulb.ts`).
    static let catalogue = InventoryCatalogue(
        version: "vectors", units: [],
        types: [
            InventoryType(
                key: "bulb", name: "Light bulb", capabilities: [],
                fields: [
                    InventoryFieldDefinition(
                        key: "Fitting", label: "Fitting", kind: .choice,
                        choices: ["E27", "GU10", "B22"])
                ])
        ])

    static func date(_ text: String) throws -> Date {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: text) else { throw Malformed(description: text) }
        return date
    }

    static func item(_ seed: CommandVectorFile.SeedItem) throws -> InventoryItem {
        InventoryItem(
            id: seed.id, revision: 1, seq: 0, name: seed.name, typeKey: seed.typeKey,
            code: seed.code, quantity: InventoryQuantity(count: seed.quantity ?? 1),
            placement: try placement(seed.placement),
            containment: seed.isContainer?.isTrue == true
                ? InventoryContainment(
                    access: InventoryAccess(wire: seed.access ?? "open"), isFull: false)
                : nil,
            createdAt: clock, updatedAt: clock, deletedAt: try seed.deletedAt.map(date))
    }

    static func location(_ seed: CommandVectorFile.SeedLocation) -> InventoryLocation {
        InventoryLocation(
            id: seed.id, revision: 1, seq: 0, name: seed.name, parentId: seed.parentId,
            sortOrder: 0)
    }

    static func placement(_ wire: CommandVectorFile.Placement) throws -> InventoryPlacement {
        switch (wire.kind, wire.locationId, wire.itemId) {
        case ("location", let id?, _): return .location(id)
        case ("container", _, let id?): return .container(id)
        case ("hand", _, _): return .hand
        default: throw Malformed(description: "placement \(wire.kind)")
        }
    }

    static func placement(_ json: JSONValue?) throws -> InventoryPlacement {
        try placement(
            CommandVectorFile.Placement(
                kind: json?["kind"]?.string ?? "", locationId: json?["locationId"]?.string,
                itemId: json?["itemId"]?.string))
    }

    /// Field values typed by the catalogue, as the transport decodes them.
    static func fields(_ json: JSONValue?, typeKey: String?) throws -> [String: InventoryFieldValue]
    {
        guard case .object(let object)? = json else { return [:] }
        let type = typeKey.flatMap { catalogue.type(forKey: $0) }
        return try object.mapValues { value in
            guard let text = value.string else { throw Malformed(description: "field \(value)") }
            return type?.fields.first?.kind == .choice ? .choice(text) : .text(text)
        }
    }

    static func command(_ mutation: CommandVectorFile.Mutation, locations: Set<String>) throws
        -> InventoryCommand
    {
        let args = mutation.args
        let id = mutation.entityId
        if let command = try itemCommand(mutation.op, id: id, args: args) { return command }
        if let command = try auxCommand(mutation.op, id: id, args: args) { return command }
        switch mutation.op {
        case "location.create":
            return .createLocation(
                InventoryNewLocation(
                    id: id, name: try require(args["location"]?["name"]?.string),
                    parentId: args["location"]?["parentId"]?.string, sortOrder: 0))
        case "location.rename":
            return .renameLocation(id: id, name: try require(args["name"]?.string))
        case "location.move": return .moveLocation(id: id, parentId: args["parentId"]?.string)
        case "location.delete": return .deleteLocation(id: id)
        case "event.revert":
            return .revertEvent(
                seq: try require(args["seq"]?.int),
                entityKind: locations.contains(id) ? .location : .item, entityId: id)
        default: throw Malformed(description: "no mapping for op \(mutation.op)")
        }
    }

    private static func itemCommand(_ op: String, id: String, args: JSONValue) throws
        -> InventoryCommand?
    {
        switch op {
        case "item.create":
            let item = args["item"]
            let typeKey = item?["typeKey"]?.string
            return .createItem(
                InventoryNewItem(
                    id: id, name: try require(item?["name"]?.string), typeKey: typeKey,
                    fields: try fields(item?["fields"], typeKey: typeKey),
                    note: item?["note"]?.string, quantity: item?["quantity"]?.int ?? 1,
                    placement: try placement(item?["placement"])))
        case "item.edit":
            return .editItem(id: id, name: args["name"]?.string, note: .unchanged, fields: [:])
        case "item.changeType":
            let typeKey = try require(args["typeKey"]?.string)
            return .changeItemType(
                id: id, typeKey: typeKey, fields: try fields(args["fields"], typeKey: typeKey))
        case "item.setCode": return .setItemCode(id: id, code: args["code"]?.string)
        case "item.move":
            let verb = try require(
                args["verb"]?.string.flatMap(InventoryMoveVerb.init(vectorWire:)))
            return .moveItem(id: id, to: try placement(args["to"]), verb: verb)
        case "item.setAccess":
            return .setItemAccess(
                id: id, access: InventoryAccess(wire: try require(args["access"]?.string)))
        case "item.setFull":
            guard let full = args["full"], full.isBool else { throw Malformed(description: "full") }
            return .setItemFull(id: id, isFull: full.isTrue)
        case "item.setLifecycle":
            return .setItemLifecycle(
                id: id, lifecycle: InventoryLifecycle(wire: try require(args["lifecycle"]?.string)),
                reason: args["reason"]?.string.map(InventoryDiscardReason.init(wire:)))
        case "item.setQuantity":
            return .setItemQuantity(id: id, quantity: try require(args["quantity"]?.int))
        default: return nil
        }
    }

    private static func auxCommand(_ op: String, id: String, args: JSONValue) throws
        -> InventoryCommand?
    {
        switch op {
        case "item.split":
            return .splitItem(
                id: id, newItemId: try require(args["newItemId"]?.string),
                quantity: try require(args["quantity"]?.int))
        case "item.attachPhoto":
            return .attachPhoto(
                itemId: id, sha256: try require(args["sha256"]?.string),
                position: try require(args["position"]?.int))
        case "item.removePhoto":
            return .removePhoto(itemId: id, sha256: try require(args["sha256"]?.string))
        case "item.reorderPhotos":
            guard case .array(let hashes)? = args["sha256s"] else {
                throw Malformed(description: "sha256s")
            }
            return .reorderPhotos(itemId: id, sha256s: try hashes.map { try require($0.string) })
        case "item.restoreDeleted": return .restoreDeletedItem(id: id)
        case "item.delete": return .deleteItem(id: id)
        default: return nil
        }
    }

    private static func require<Value>(_ value: Value?) throws -> Value {
        guard let value else { throw Malformed(description: "a required argument is missing") }
        return value
    }
}

extension InventoryMoveVerb {
    fileprivate init?(vectorWire: String) {
        guard
            let verb = [Self.move, .pickUp, .putBack, .store].first(where: {
                $0.wireValue == vectorWire
            })
        else { return nil }
        self = verb
    }
}
