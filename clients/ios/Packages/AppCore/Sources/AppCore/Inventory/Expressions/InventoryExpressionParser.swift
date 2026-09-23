import Foundation

/// `expression-parser.ts`, node for node: the same checks in the same order,
/// so a malformed tree fails with the same code at the same path.
internal struct InventoryExpressionParser {
    private var nodes = 0

    private static let unary: Set<InventoryExpressionOp> = [.negate, .not]
    private static let binary: Set<InventoryExpressionOp> = [
        .add, .subtract, .multiply, .divide, .concat, .equal, .lessThan, .and, .or,
    ]

    mutating func node(_ json: InventoryJSON, at path: String) throws(InventoryExpressionRejection)
        -> InventoryExpression
    {
        nodes += 1
        if nodes > InventoryExpression.maximumNodes {
            throw InventoryExpressionRejection(code: "expression_nodes_exceeded", path: path)
        }
        let object = try Self.record(json, at: path)
        let op: InventoryExpressionOp?
        if case .string(let name)? = object["op"] {
            op = InventoryExpressionOp(rawValue: name)
        } else {
            op = nil
        }
        switch op {
        case .literal?:
            try Self.exactKeys(object, ["op", "value"], at: path)
            return .literal(try Self.literal(object["value"] ?? .null, at: "\(path).value"))
        case .read?: return try Self.read(object, at: path)
        case .conditional?: return try conditional(object, at: path)
        case let op? where Self.unary.contains(op):
            try Self.exactKeys(object, ["op", "value"], at: path)
            return .unary(op, try child(object, "value", at: path))
        case let op? where Self.binary.contains(op):
            try Self.exactKeys(object, ["left", "op", "right"], at: path)
            let left = try child(object, "left", at: path)
            return .binary(op, left, try child(object, "right", at: path))
        default:
            throw InventoryExpressionRejection(code: "expression_op_unknown", path: "\(path).op")
        }
    }

    private mutating func child(_ object: [String: InventoryJSON], _ key: String, at path: String)
        throws(InventoryExpressionRejection) -> InventoryExpression
    {
        try node(object[key] ?? .null, at: "\(path).\(key)")
    }

    private mutating func conditional(_ object: [String: InventoryJSON], at path: String)
        throws(InventoryExpressionRejection) -> InventoryExpression
    {
        try Self.exactKeys(object, ["condition", "else", "op", "then"], at: path)
        let condition = try child(object, "condition", at: path)
        let then = try child(object, "then", at: path)
        return .conditional(condition, then: then, otherwise: try child(object, "else", at: path))
    }

    private static func read(_ object: [String: InventoryJSON], at path: String)
        throws(InventoryExpressionRejection) -> InventoryExpression
    {
        try exactKeys(object, ["fieldId", "op", "path"], at: path)
        guard case .string(let fieldId)? = object["fieldId"], !fieldId.isEmpty else {
            throw InventoryExpressionRejection(code: "field_id_invalid", path: "\(path).fieldId")
        }
        guard case .array(let elements)? = object["path"] else {
            throw InventoryExpressionRejection(code: "reference_path_invalid", path: "\(path).path")
        }
        var hops: [String] = []
        for element in elements {
            guard case .string(let hop) = element else {
                throw InventoryExpressionRejection(
                    code: "reference_path_invalid", path: "\(path).path")
            }
            hops.append(hop)
        }
        guard hops.count <= InventoryExpression.maximumReferenceHops else {
            throw InventoryExpressionRejection(
                code: "reference_hops_exceeded", path: "\(path).path")
        }
        return .read(path: hops, fieldId: fieldId)
    }

    private static func literal(_ json: InventoryJSON, at path: String)
        throws(InventoryExpressionRejection)
        -> InventoryExpressionValue
    {
        switch InventoryExpressionValue.parse(json) {
        case .value(let value): return value
        case .notAnObject:
            throw InventoryExpressionRejection(code: "expression_node_invalid", path: path)
        case .notPrimitive: throw InventoryExpressionRejection(code: "literal_invalid", path: path)
        }
    }

    private static func record(_ json: InventoryJSON, at path: String)
        throws(InventoryExpressionRejection)
        -> [String: InventoryJSON]
    {
        guard case .object(let object) = json else {
            throw InventoryExpressionRejection(code: "expression_node_invalid", path: path)
        }
        return object
    }

    private static func exactKeys(
        _ object: [String: InventoryJSON], _ keys: [String], at path: String
    )
        throws(InventoryExpressionRejection)
    {
        guard object.keys.sorted() == keys else {
            throw InventoryExpressionRejection(code: "expression_node_invalid", path: path)
        }
    }
}
