import AppCore

/// Inventory on the phone: the dashboard, and the screens it opens.
///
/// The imports across this module are the whole of what a feature may reach
/// for: the seams in `AppCore`, the tokens and primitives in `DesignSystem`.
/// It reads and writes through `InventoryStore` and never learns whether the
/// replica behind it is in memory, on disk, or waiting on the server.
public enum FeatureInventory {
    /// Which of the BFM's features this module draws.
    public static let feature = MobileFeature(rawValue: "inventory")

    /// The tab bar's label for this feature.
    public static let displayName = "Inventory"

    /// The tab bar's icon for this feature.
    public static let symbolName = "shippingbox"
}
