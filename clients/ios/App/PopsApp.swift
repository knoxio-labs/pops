import AppCore
import SwiftUI

@main
internal struct PopsApp: App {
    /// Held here rather than by `RootView`, because a background refresh
    /// launches the app without drawing a scene: the refresh needs the
    /// composition whether or not any view exists.
    @State private var composition = AppComposition()

    var body: some Scene {
        WindowGroup {
            RootView(composition: composition)
        }
        // Registered by SwiftUI at launch, as `BGTaskScheduler` requires. The
        // system expiring the task cancels this closure, which the refresh
        // treats as the end of its time.
        .backgroundTask(.appRefresh(BackgroundRefresh.inventoryIdentifier)) {
            await composition.refreshInventoryInBackground()
        }
    }
}
