import Foundation

/// `expression-evaluator.ts`: evaluates a parsed expression against one
/// snapshot, short-circuiting `and`, `or` and `if` before their unread sides,
/// then checks the result is a canonical value of the declared kind.
public struct InventoryExpressionEvaluator {
    typealias Raw = InventoryExpressionEvaluation<InventoryExpressionValue>

    let snapshot: any InventoryExpressionSnapshot

    /// Evaluates `expression`, whose declared result is `kind` (and `fixedUnit`
    /// for a measurement). A result that is not canonical for that kind is
    /// the `invalid_value` error, as on the server.
    public static func evaluate(
        _ expression: InventoryExpression, kind: InventoryPrimitiveKind, fixedUnit: String?,
        in snapshot: any InventoryExpressionSnapshot
    ) -> InventoryExpressionEvaluation<InventoryPrimitiveValue> {
        switch Self(snapshot: snapshot).node(expression) {
        case .value(let value, let dependencies):
            guard let canonical = value.canonical(kind: kind, fixedUnit: fixedUnit) else {
                return .error(.invalidValue, dependencies: dependencies)
            }
            return .value(canonical, dependencies: dependencies)
        case .unavailable(let unavailable, let dependencies):
            return .unavailable(unavailable, dependencies: dependencies)
        case .error(let code, let dependencies):
            return .error(code, dependencies: dependencies)
        }
    }

    func node(_ expression: InventoryExpression) -> Raw {
        switch expression {
        case .literal(let value): return .value(value, dependencies: [])
        case .read(let path, let fieldId):
            return InventoryExpressionReader(snapshot: snapshot).read(path, fieldId)
        case .unary(let op, let value): return unary(op, value)
        case .binary(let op, let left, let right): return binary(op, left, right)
        case .conditional(let condition, let then, let otherwise):
            return conditional(condition, then: then, otherwise: otherwise)
        }
    }

    private func unary(_ op: InventoryExpressionOp, _ operand: InventoryExpression) -> Raw {
        let evaluated = node(operand)
        guard case .value(let value, let dependencies) = evaluated else { return evaluated }
        if op == .not {
            guard case .boolean(let boolean) = value else {
                return .error(.invalidValue, dependencies: dependencies)
            }
            return .value(.boolean(!boolean), dependencies: dependencies)
        }
        return Self.lift(InventoryExpressionArithmetic.negate(value), dependencies)
    }

    private func binary(
        _ op: InventoryExpressionOp, _ leftNode: InventoryExpression,
        _ rightNode: InventoryExpression
    )
        -> Raw
    {
        let left = node(leftNode)
        guard case .value(let leftValue, let leftDependencies) = left else { return left }
        if op == .and, leftValue == .boolean(false) { return left }
        if op == .or, leftValue == .boolean(true) { return left }
        let right = node(rightNode)
        guard case .value(let rightValue, let rightDependencies) = right else {
            return right.merging(leftDependencies)
        }
        let dependencies = InventoryValueDependency.unique(leftDependencies + rightDependencies)
        return Self.combine(op, leftValue, rightValue, dependencies)
    }

    private static func combine(
        _ op: InventoryExpressionOp, _ left: InventoryExpressionValue,
        _ right: InventoryExpressionValue,
        _ dependencies: [InventoryValueDependency]
    ) -> Raw {
        switch op {
        case .add:
            return lift(
                InventoryExpressionArithmetic.add(left, right, subtracting: false), dependencies)
        case .subtract:
            return lift(
                InventoryExpressionArithmetic.add(left, right, subtracting: true), dependencies)
        case .multiply:
            return lift(InventoryExpressionArithmetic.multiply(left, right), dependencies)
        case .divide: return lift(InventoryExpressionArithmetic.divide(left, right), dependencies)
        case .equal: return .value(.boolean(left.wireEquals(right)), dependencies: dependencies)
        case .lessThan:
            return lift(InventoryExpressionArithmetic.lessThan(left, right), dependencies)
        case .concat:
            guard case .text(let lhs) = left, case .text(let rhs) = right else {
                return .error(.invalidValue, dependencies: dependencies)
            }
            return .value(.text(lhs + rhs), dependencies: dependencies)
        default:
            guard case .boolean(let lhs) = left, case .boolean(let rhs) = right else {
                return .error(.invalidValue, dependencies: dependencies)
            }
            return .value(
                .boolean(op == .and ? lhs && rhs : lhs || rhs), dependencies: dependencies)
        }
    }

    private func conditional(
        _ conditionNode: InventoryExpression, then: InventoryExpression,
        otherwise: InventoryExpression
    ) -> Raw {
        let condition = node(conditionNode)
        guard case .value(let value, let dependencies) = condition else { return condition }
        guard case .boolean(let chosen) = value else {
            return .error(.invalidValue, dependencies: dependencies)
        }
        return node(chosen ? then : otherwise).merging(dependencies)
    }

    private static func lift(
        _ outcome: Result<InventoryExpressionValue, InventoryExpressionErrorCode>,
        _ dependencies: [InventoryValueDependency]
    ) -> Raw {
        switch outcome {
        case .success(let value): return .value(value, dependencies: dependencies)
        case .failure(let code):
            return .error(code, dependencies: InventoryValueDependency.unique(dependencies))
        }
    }
}
