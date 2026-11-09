import SwiftUI

@main
internal struct TripsApp: App {
    @State private var composition = AppComposition(experience: .trips)

    internal var body: some Scene {
        WindowGroup {
            RootView(composition: composition)
        }
    }
}
