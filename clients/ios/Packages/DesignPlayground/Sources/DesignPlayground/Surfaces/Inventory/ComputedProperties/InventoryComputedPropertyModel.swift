import Foundation

internal struct InventoryComputedPropertyDefinition: Equatable {
    internal let name: String
    internal let unit: String
    internal let formula: String
    internal let allowsOverride: Bool

    internal static let capacity = InventoryComputedPropertyDefinition(
        name: "Capacity",
        unit: "L",
        formula: "Width × Height × Depth ÷ 1000",
        allowsOverride: true
    )
}

internal enum StorageBoxCapacity {
    internal static func litres(width: String, height: String, depth: String) -> String? {
        let values = [width, height, depth].compactMap(Double.init)
        guard values.count == 3, values.allSatisfy({ $0.isFinite && $0 > 0 }) else { return nil }

        let litres = values.reduce(1, *) / 1000
        if litres == litres.rounded() { return String(format: "%.0f", litres) }
        return String(format: "%.2f", litres)
            .replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\.$", with: "", options: .regularExpression)
    }
}

internal enum InventoryComputedValueState: String, Equatable {
    case calculated = "Calculated"
    case overridden = "Overridden"
    case unavailable = "Needs dimensions"
}
