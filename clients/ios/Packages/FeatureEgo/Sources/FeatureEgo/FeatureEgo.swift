import AppCore

/// The mobile Ego feature.
public enum FeatureEgo {
    public static let moduleName = "FeatureEgo"

    /// Which of the BFM's features this module draws.
    public static let feature = MobileFeature(rawValue: "ego")

    /// The tab bar's label for this feature.
    public static let displayName = "Ego"

    /// The tab bar's icon for this feature.
    public static let symbolName = "bubble.left"
}
