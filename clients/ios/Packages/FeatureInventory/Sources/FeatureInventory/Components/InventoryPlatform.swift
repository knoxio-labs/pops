import SwiftUI

extension View {
    /// Liquid Glass where the platform has it, and the nearest material where
    /// it does not.
    ///
    /// This file holds every platform conditional in the package, and holds
    /// them alone: the package builds for macOS so `swift test` runs on the
    /// host, and `glassEffect` and the navigation title display mode do not
    /// exist there.
    @ViewBuilder
    internal func inventoryGlass(in shape: some Shape) -> some View {
        #if os(iOS)
            glassEffect(.regular, in: shape)
        #else
            background(.regularMaterial, in: shape)
        #endif
    }

    /// Sets the navigation title's display mode, which is an iOS-only
    /// modifier.
    @ViewBuilder
    internal func inventoryTitleDisplay(large: Bool) -> some View {
        #if os(iOS)
            navigationBarTitleDisplayMode(large ? .large : .inline)
        #else
            self
        #endif
    }
}
