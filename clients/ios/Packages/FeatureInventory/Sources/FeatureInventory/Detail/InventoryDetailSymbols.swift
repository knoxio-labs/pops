/// The glyphs Item detail, its menu and History draw beyond the dashboard's,
/// taken from the design playground's one-glyph-per-concept set with the
/// same SF Symbol for each concept.
extension InventorySymbol {
    internal static let code = InventorySymbol(system: "qrcode")
    internal static let label = InventorySymbol(system: "tag")
    internal static let printLabel = InventorySymbol(system: "printer")
    internal static let photo = InventorySymbol(system: "photo")
    internal static let inHand = InventorySymbol(system: "hand.raised")
    internal static let edit = InventorySymbol(system: "pencil")
    internal static let addNew = InventorySymbol(system: "plus")
    internal static let split = InventorySymbol(system: "scissors")
    internal static let reduceQuantity = InventorySymbol(system: "minus.circle")
    /// Reopen draws the closed box it acts on: SF Symbols has no opened box,
    /// and the playground's custom one is an asset this package does not
    /// carry.
    internal static let reopen = InventorySymbol(system: "shippingbox")
    internal static let close = InventorySymbol(system: "shippingbox")
    internal static let discard = InventorySymbol(system: "trash")
    internal static let retired = InventorySymbol(system: "archivebox")
    internal static let lost = InventorySymbol(system: "questionmark.circle")
    internal static let destroyed = InventorySymbol(system: "xmark.octagon")
    internal static let donated = InventorySymbol(system: "gift")
    internal static let sold = InventorySymbol(system: "banknote")
    internal static let consumed = InventorySymbol(system: "flame")
    internal static let broken = InventorySymbol(system: "bandage")
    internal static let gaveAway = InventorySymbol(system: "person.2")
}
