import AppCore
import FeatureEgo

internal enum AppExperience {
    case pops
    case trips

    internal var renderableFeatures: [MobileFeature] {
        switch self {
        case .pops: RootFeature.renderable
        case .trips: [FeatureEgo.feature]
        }
    }

    internal var usesInventory: Bool { self == .pops }
}
