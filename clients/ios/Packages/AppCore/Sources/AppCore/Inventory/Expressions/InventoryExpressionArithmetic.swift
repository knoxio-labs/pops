import Foundation

/// `expression-arithmetic.ts` over ``InventoryExpressionValue``: identical
/// numeric kinds, exact decimals, a fixed-unit measurement scaled by a decimal,
/// and integers bounded to the server's safe range.
internal enum InventoryExpressionArithmetic {
    typealias Outcome = Result<InventoryExpressionValue, InventoryExpressionErrorCode>

    static func add(
        _ left: InventoryExpressionValue, _ right: InventoryExpressionValue, subtracting: Bool
    )
        -> Outcome
    {
        if case .integer(let lhs) = left, case .integer(let rhs) = right {
            let (sum, overflow) =
                subtracting
                ? lhs.subtractingReportingOverflow(rhs) : lhs.addingReportingOverflow(rhs)
            return integer(sum, overflow: overflow)
        }
        if case .measurement(let lhs, let unit) = left,
            case .measurement(let rhs, let other) = right,
            unit.wireEquals(other)
        {
            return measured(add(.text(lhs), .text(rhs), subtracting: subtracting), unit: unit)
        }
        guard let (lhs, rhs) = decimals(left, right) else { return .failure(.invalidValue) }
        guard let aligned = InventoryExpressionDecimal.aligned(lhs, rhs) else {
            return .failure(.precisionOverflow)
        }
        let (coefficient, overflow) =
            subtracting
            ? aligned.left.coefficient.subtractingReportingOverflow(aligned.right.coefficient)
            : aligned.left.coefficient.addingReportingOverflow(aligned.right.coefficient)
        if overflow { return .failure(.precisionOverflow) }
        return text(
            InventoryExpressionDecimal(coefficient: coefficient, scale: aligned.left.scale).text)
    }

    static func multiply(_ left: InventoryExpressionValue, _ right: InventoryExpressionValue)
        -> Outcome
    {
        if case .integer(let lhs) = left, case .integer(let rhs) = right {
            let (product, overflow) = lhs.multipliedReportingOverflow(by: rhs)
            return integer(product, overflow: overflow)
        }
        if case .measurement(let amount, let unit) = left, case .text = right {
            return measured(multiply(.text(amount), right), unit: unit)
        }
        guard let (lhs, rhs) = decimals(left, right) else { return .failure(.invalidValue) }
        let (coefficient, overflow) = lhs.coefficient.multipliedReportingOverflow(
            by: rhs.coefficient)
        if overflow { return .failure(.precisionOverflow) }
        return text(
            InventoryExpressionDecimal(coefficient: coefficient, scale: lhs.scale + rhs.scale).text)
    }

    static func divide(_ left: InventoryExpressionValue, _ right: InventoryExpressionValue)
        -> Outcome
    {
        if case .integer(let lhs) = left, case .integer(let rhs) = right {
            if rhs == 0 { return .failure(.divisionByZero) }
            return lhs % rhs == 0
                ? integer(lhs / rhs, overflow: false) : .failure(.precisionOverflow)
        }
        if case .measurement(let amount, let unit) = left, case .text = right {
            return measured(divide(.text(amount), right), unit: unit)
        }
        guard let (lhs, rhs) = decimals(left, right) else { return .failure(.invalidValue) }
        return text(InventoryExpressionDecimal.divided(lhs, by: rhs))
    }

    static func negate(_ value: InventoryExpressionValue) -> Outcome {
        switch value {
        case .integer(let integer): return self.integer(-integer, overflow: false)
        case .measurement(let amount, let unit): return measured(negate(.text(amount)), unit: unit)
        case .text(let text):
            guard let decimal = InventoryExpressionDecimal(text) else {
                return .failure(.invalidValue)
            }
            return self.text(
                InventoryExpressionDecimal(coefficient: -decimal.coefficient, scale: decimal.scale)
                    .text)
        default: return .failure(.invalidValue)
        }
    }

    /// `invalid_value` when the operands are not identical numeric kinds.
    static func lessThan(_ left: InventoryExpressionValue, _ right: InventoryExpressionValue)
        -> Outcome
    {
        if case .integer(let lhs) = left, case .integer(let rhs) = right {
            return .success(.boolean(lhs < rhs))
        }
        if case .measurement(let lhs, let unit) = left,
            case .measurement(let rhs, let other) = right,
            unit.wireEquals(other)
        {
            return lessThan(.text(lhs), .text(rhs))
        }
        guard let (lhs, rhs) = decimals(left, right),
            let aligned = InventoryExpressionDecimal.aligned(lhs, rhs)
        else { return .failure(.invalidValue) }
        return .success(.boolean(aligned.left.coefficient < aligned.right.coefficient))
    }

    private static func integer(_ value: Int64, overflow: Bool) -> Outcome {
        guard !overflow, InventoryExpressionValue.safeIntegers.contains(value) else {
            return .failure(.integerOverflow)
        }
        return .success(.integer(value))
    }

    private static func measured(_ amount: Outcome, unit: String) -> Outcome {
        amount.flatMap { value in
            guard case .text(let text) = value else { return .failure(.invalidValue) }
            return .success(.measurement(amount: text, unit: unit))
        }
    }

    private static func text(_ result: Result<String, InventoryExpressionErrorCode>) -> Outcome {
        result.map(InventoryExpressionValue.text)
    }

    private static func decimals(
        _ left: InventoryExpressionValue, _ right: InventoryExpressionValue
    )
        -> (InventoryExpressionDecimal, InventoryExpressionDecimal)?
    {
        guard case .text(let lhs) = left, case .text(let rhs) = right,
            let leftDecimal = InventoryExpressionDecimal(lhs),
            let rightDecimal = InventoryExpressionDecimal(rhs)
        else { return nil }
        return (leftDecimal, rightDecimal)
    }
}
