import Foundation

/// `expression-dimensional.ts`, expression version 2: measurements of one
/// dimension add, subtract and compare after the right is converted into the
/// left's unit, and multiply and divide into derived units. Anything that is
/// not two measurements behaves as in version 1.
extension InventoryExpressionArithmetic {
    /// `amountIn`: the amount in `unit`, nil across dimensions.
    private static func amount(_ amount: String, from unit: String, in target: String)
        -> Result<String, InventoryExpressionErrorCode>?
    {
        guard let shift = InventoryMeasurementUnits.conversionShift(from: unit, to: target) else {
            return nil
        }
        return InventoryExpressionDecimal.shifted(amount, by: shift)
    }

    static func dimensionalAdd(
        _ left: InventoryExpressionValue, _ right: InventoryExpressionValue, subtracting: Bool
    ) -> Outcome {
        guard case .measurement(_, let unit) = left,
            case .measurement(let rhs, let other) = right
        else { return add(left, right, subtracting: subtracting) }
        guard let converted = amount(rhs, from: other, in: unit) else {
            return .failure(.invalidValue)
        }
        switch converted {
        case .failure(let code): return .failure(code)
        case .success(let text):
            return add(left, .measurement(amount: text, unit: unit), subtracting: subtracting)
        }
    }

    static func dimensionalLessThan(
        _ left: InventoryExpressionValue, _ right: InventoryExpressionValue
    ) -> Outcome {
        guard case .measurement(let lhs, let unit) = left,
            case .measurement(let rhs, let other) = right
        else { return lessThan(left, right) }
        guard let converted = amount(rhs, from: other, in: unit) else {
            return .failure(.invalidValue)
        }
        return converted.flatMap { lessThan(.text(lhs), .text($0)) }
    }

    /// `dimensionalMeasurementEqual`: numerically equal once converted;
    /// different dimensions are not equal.
    static func dimensionalMeasurementEqual(
        _ lhs: String, _ unit: String, _ rhs: String, _ other: String
    ) -> Outcome {
        guard let converted = amount(rhs, from: other, in: unit) else {
            return .success(.boolean(false))
        }
        return converted.flatMap { text in
            let below = lessThan(.text(lhs), .text(text))
            let above = lessThan(.text(text), .text(lhs))
            guard case .success(.boolean(let isBelow)) = below,
                case .success(.boolean(let isAbove)) = above
            else { return .failure(.invalidValue) }
            return .success(.boolean(!isBelow && !isAbove))
        }
    }

    static func dimensionalMultiply(
        _ left: InventoryExpressionValue, _ right: InventoryExpressionValue, dividing: Bool
    ) -> Outcome {
        guard case .measurement(let lhs, let unit) = left,
            case .measurement(let rhs, let other) = right
        else { return dividing ? divide(left, right) : multiply(left, right) }
        guard let combined = InventoryMeasurementUnits.combine(unit, other, sign: dividing ? -1 : 1)
        else { return .failure(.invalidValue) }
        return InventoryExpressionDecimal.shifted(rhs, by: combined.rightShift)
            .flatMap { rightAmount -> Outcome in
                dividing
                    ? divide(.text(lhs), .text(rightAmount))
                    : multiply(.text(lhs), .text(rightAmount))
            }
            .flatMap { product -> Outcome in
                guard case .text(let amount) = product else { return .failure(.invalidValue) }
                if combined.term.isEmpty { return .success(product) }
                if InventoryMeasurementUnits.dimension(of: combined.term).isEmpty {
                    return InventoryExpressionDecimal.shifted(
                        amount, by: InventoryMeasurementUnits.powerOfTen(combined.term)
                    ).map(InventoryExpressionValue.text)
                }
                return .success(
                    .measurement(
                        amount: amount, unit: InventoryMeasurementUnits.format(combined.term)))
            }
    }

    /// `convertToFixedUnit`: a version-2 result in the field's fixed unit.
    static func converted(_ value: InventoryExpressionValue, toFixedUnit fixedUnit: String?)
        -> Outcome
    {
        guard case .measurement(let amount, let unit) = value, let fixedUnit,
            !unit.wireEquals(fixedUnit)
        else { return .success(value) }
        guard let converted = self.amount(amount, from: unit, in: fixedUnit) else {
            return .failure(.invalidValue)
        }
        return converted.map { .measurement(amount: $0, unit: fixedUnit) }
    }
}
