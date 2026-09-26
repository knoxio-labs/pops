import AppCore

/// The glyphs only the item form draws, with the design playground's names,
/// so a screen that later needs one finds it where every other glyph is.
extension InventorySymbol {
    internal static let camera = InventorySymbol(system: "camera")
    internal static let scan = InventorySymbol(system: "barcode.viewfinder")
    internal static let useText = InventorySymbol(system: "text.viewfinder")
    internal static let suggest = InventorySymbol(system: "sparkles")
    internal static let add = InventorySymbol(system: "plus")

    /// Where an item will go, in the dashboard's vocabulary: an open
    /// container, a location, or in hand.
    internal static func destination(_ placement: InventoryPlacement) -> InventorySymbol {
        switch placement {
        case .container: openContainer
        case .location: InventorySymbol(system: "house")
        case .hand: InventorySymbol(system: "hand.raised")
        }
    }
}
