internal enum PurchasesAccessibility {
    internal static let homeRoot = "purchases-home"
    internal static let allTile = "purchases-home-all"
    internal static let unmatchedTile = "purchases-home-unmatched"
    internal static let listPicker = "purchases-home-list"
    internal static let add = "purchases-home-add"
    internal static let scan = "purchases-home-scan"

    internal static func row(_ id: String) -> String {
        "purchases-home-row-\(id)"
    }

    internal static func highlightedRow(_ id: String) -> String {
        "purchases-home-highlighted-row-\(id)"
    }
}
