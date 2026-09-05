import AppCore

/// The purchase history a paired device can browse.
public enum FeaturePurchases {
    public static let feature = MobileFeature(rawValue: "purchases")

    /// The tab bar's label for this feature.
    public static let displayName = "Purchases"

    /// The tab bar's icon for this feature.
    public static let symbolName = "cart"
}
