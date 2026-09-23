import Foundation

/// Every node an expression-version-1 AST may contain. Mirrors the server's
/// `EXPRESSION_V1_OPS`; the shared vectors check both lists are evaluated.
public enum InventoryExpressionOp: String, CaseIterable, Hashable, Sendable {
    case literal
    case read
    case negate
    case not
    case add
    case subtract
    case multiply
    case divide
    case concat
    case equal
    case lessThan = "less_than"
    case and
    case or
    case conditional = "if"
    case coalesce
}

/// A parsed computed-field expression (Inventory ADR-002 D5, version 1).
///
/// Parse it with ``parse(version:json:)`` from the catalogue's stored JSON; a
/// catalogue using syntax this build does not know fails to parse, and the
/// replica then keeps the server's value rather than guessing.
public indirect enum InventoryExpression: Hashable, Sendable {
    case literal(InventoryExpressionValue)
    /// Follows each reference field in `path` from the root item, then reads `fieldId`.
    case read(path: [String], fieldId: String)
    case unary(InventoryExpressionOp, InventoryExpression)
    case binary(InventoryExpressionOp, InventoryExpression, InventoryExpression)
    case conditional(InventoryExpression, then: InventoryExpression, otherwise: InventoryExpression)
    /// The first of two or more expressions that has a value.
    case coalesce([InventoryExpression])

    /// The most nodes one expression may contain.
    public static let maximumNodes = 128
    /// The most reference hops one read may take.
    public static let maximumReferenceHops = 2

    /// This node's op.
    public var op: InventoryExpressionOp {
        switch self {
        case .literal: return .literal
        case .read: return .read
        case .unary(let op, _), .binary(let op, _, _): return op
        case .conditional: return .conditional
        case .coalesce: return .coalesce
        }
    }

    /// Every op in this tree.
    public var ops: Set<InventoryExpressionOp> {
        switch self {
        case .literal, .read: return [op]
        case .unary(let op, let value): return value.ops.union([op])
        case .binary(let op, let left, let right): return left.ops.union(right.ops).union([op])
        case .conditional(let condition, let then, let otherwise):
            return condition.ops.union(then.ops).union(otherwise.ops).union([.conditional])
        case .coalesce(let values):
            return values.reduce(into: [.coalesce]) { $0.formUnion($1.ops) }
        }
    }

    /// Parses stored expression JSON exactly as the server's `parseExpression`
    /// does, including which structural problem is reported first and where.
    public static func parse(version: Int, json: InventoryJSON) throws(InventoryExpressionRejection)
        -> InventoryExpression
    {
        guard version == 1 else {
            throw InventoryExpressionRejection(
                code: "expression_version_unknown", path: "expressionVersion")
        }
        var parser = InventoryExpressionParser()
        return try parser.node(json, at: "expression")
    }
}

/// Why the server would refuse an expression (stored JSON that is not a
/// version-1 tree) or an override (on a field that forbids one), with its
/// machine-readable code and the path of the offending node or field.
public struct InventoryExpressionRejection: Error, Hashable, Sendable {
    public let code: String
    public let path: String

    public init(code: String, path: String) {
        self.code = code
        self.path = path
    }
}
