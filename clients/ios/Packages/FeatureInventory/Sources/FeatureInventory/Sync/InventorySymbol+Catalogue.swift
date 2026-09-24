/// The glyphs a catalogue-changed repair and a held change draw, as the
/// design playground's `inventory/catalogue-repair` surface draws them. A
/// definition taken out of use is `retired`, the lifecycle's own glyph.
extension InventorySymbol {
    /// A field or type a newer catalogue swapped for another.
    internal static let replaced = InventorySymbol(system: "arrow.left.arrow.right")
    internal static let required = InventorySymbol(system: "asterisk")
    /// The phone fetching the catalogue's newer fields.
    internal static let refreshFields = InventorySymbol(system: "arrow.triangle.2.circlepath")
    /// Named by a newer catalogue that has not reached this phone.
    internal static let newerFields = InventorySymbol(system: "arrow.down.circle")
    /// Waiting on something else to settle first.
    internal static let held = InventorySymbol(system: "pause.circle")
}
