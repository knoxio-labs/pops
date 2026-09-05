import DesignPlayground
import SwiftUI

/// The design playground's entry point, and deliberately the whole of it.
///
/// There is no composition root here because there is nothing to compose: the
/// playground links `DesignPlayground`, which links `AppCore` and
/// `DesignSystem` and nothing else. No client, no keychain, no store, no
/// session — so there is no dependency to bind, nothing to restore on launch,
/// and no state that outlives the process.
///
/// That is what makes this app work with the phone in flight mode, and it is
/// enforced by the package graph rather than by anybody remembering: a
/// networking call would need `BFMClient`, and adding it to
/// `DesignPlayground/Package.swift` is a change a reviewer would see.
@main
struct PopsPlaygroundApp: App {
    var body: some Scene {
        WindowGroup {
            PlaygroundRootView()
        }
    }
}
