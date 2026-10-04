import AppCore
import Observation

/// Tracks the app and object currently visible to an Ego conversation.
@MainActor
@Observable
internal final class EgoScreenContextProvider {
    internal var selectedTab: MobileFeature?
    internal var moreSelection: MobileFeature?
    internal var presentedObjectURI: String?

    @ObservationIgnored private let routerPath: (MobileFeature) -> [Route]

    internal init(routerPath: @escaping (MobileFeature) -> [Route]) {
        self.routerPath = routerPath
    }

    internal var current: EgoAppContext? {
        let feature = currentFeature
        return makeEgoAppContext(
            feature: feature,
            routerPath: feature.map(routerPath) ?? [],
            presentedObjectURI: presentedObjectURI
        )
    }

    private var currentFeature: MobileFeature? {
        guard let selectedTab else { return nil }
        if selectedTab == ContentView.searchTab { return nil }
        if selectedTab == ContentView.moreTab { return moreSelection }
        return selectedTab
    }
}
