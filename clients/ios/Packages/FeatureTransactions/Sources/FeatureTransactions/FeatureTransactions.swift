import AppCore
import BFMClient
import DesignSystem

/// The transactions list and detail screens. Placeholder — neither is written.
///
/// The imports above are the whole of what a feature is allowed to reach for.
/// A second `Feature*` import here is the mistake this layout exists to catch.
public enum FeatureTransactions {
    public static let moduleName = "FeatureTransactions"

    public static let dependsOn = [AppCore.moduleName, BFMClient.moduleName, DesignSystem.moduleName]
}
