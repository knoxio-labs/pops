import AppCore
import Foundation
import InventoryReplica

/// Each distinct mutation the vectors record, rebuilt as the phone's own
/// command from the values the replica read back, next to the args the engine
/// accepted. `item.create` goes through ``InventoryCommand/createProtocol2Item(_:)``
/// under a new id, since the vector's own item is already held.
internal struct ValueVectorReplay {
    private typealias File = ValueVectorFile

    internal struct Expected {
        internal let name: String
        internal let op: String
        internal let catalogueRevision: Int
        /// The engine-accepted args, serialised with sorted keys as ``SentMutation/args`` is.
        internal let args: String
    }

    internal private(set) var commands: [InventoryCommand] = []
    internal private(set) var expected: [Expected] = []

    internal init(file: ValueVectorFile, replica: InventoryReplica) throws {
        var seen = Set<String>()
        for vector in file.vectors {
            let command = try File.object(vector["command"])
            let mutationId = try File.require(command["mutationId"] as? String, "mutationId")
            guard seen.insert(mutationId).inserted else { continue }
            let entityId = try File.require(command["entityId"] as? String, "entityId")
            let item = try File.require(try replica.read(.item(id: entityId)), "item \(entityId)")
            let revision = try File.require(command["catalogueRevision"] as? Int, "revision")
            let args = try File.object(command["args"])
            let op = try File.require(command["op"] as? String, "op")
            commands.append(
                try Self.command(
                    op: op, args: args, item: item, revision: revision, index: seen.count))
            expected.append(
                Expected(
                    name: try File.require(vector["name"] as? String, "name"), op: op,
                    catalogueRevision: revision, args: try File.json(args)))
        }
    }

    private static func command(
        op: String, args: [String: Any], item: InventoryItem, revision: Int, index: Int
    ) throws -> InventoryCommand {
        switch op {
        case "item.create":
            return .createProtocol2Item(
                try created(args, from: item, revision: revision, index: index))
        case "item.edit":
            let patches = try File.require(args["values"] as? [Any], "values").map {
                let patch = try File.object($0)
                guard patch["values"] is NSNull else {
                    throw File.Missing(description: "an edit that removes a value")
                }
                return InventoryProtocol2FieldPatch(
                    fieldId: try File.require(patch["fieldId"] as? String, "fieldId"), values: nil)
            }
            return .editProtocol2Item(id: item.id, catalogueRevision: revision, values: patches)
        case "item.setOverride":
            let fieldId = try File.require(args["fieldId"] as? String, "fieldId")
            let held = item.computedValues.first { $0.fieldId == fieldId }
            guard case .overridden(let value, _)? = held?.evaluation else {
                throw File.Missing(description: "an override on \(fieldId)")
            }
            return .setComputedOverride(id: item.id, fieldId: fieldId, value: value)
        default:
            throw File.Missing(description: "a replayable op, not \(op)")
        }
    }

    private static func created(
        _ args: [String: Any], from item: InventoryItem, revision: Int, index: Int
    ) throws -> InventoryNewProtocol2Item {
        let new = try File.object(args["item"])
        let values = try File.require(new["values"] as? [Any], "values").map {
            let fieldId = try File.require(File.object($0)["fieldId"] as? String, "fieldId")
            let entry = item.fieldValues.first { $0.fieldId == fieldId && $0.source == .stored }
            guard case .value(let values)? = entry?.state else {
                throw File.Missing(description: "a read-back value for \(fieldId)")
            }
            return InventoryProtocol2FieldValue(fieldId: fieldId, values: values)
        }
        return InventoryNewProtocol2Item(
            id: String(format: "c0000000-0000-4000-8000-%012d", index),
            name: try File.require(new["name"] as? String, "name"), catalogueRevision: revision,
            typeId: try File.require(new["typeId"] as? String, "typeId"), values: values,
            placement: .hand)
    }
}
